/**
 * End-to-end pipeline test with MockLLMProvider, fixed to structural
 * assertions only (task instruction: "스냅샷성 검증은 구조만 — 깨지기 쉬운 전문
 * 비교 금지"). Exercises the real stage functions — cluster, selectTop10,
 * extractFacts, rewriteAllLevels, gateVersion — the same code runPipeline()
 * calls, wired together directly rather than through runPipeline() itself,
 * because runPipeline()'s [1] collect stage does real network RSS fetches
 * with no injection seam (pipeline/collect.ts calls rss-parser directly).
 * Everything from [2] cluster onward is exercised unmodified.
 */

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { PipelineArticle, PipelineEdition, RawItem } from "../types.js";
import { clusterEvents } from "./cluster.js";
import { selectTop10 } from "./selectTop10.js";
import { extractFacts } from "./extract.js";
import { rewriteAllLevels } from "./rewrite.js";
import { gateVersion } from "./gate.js";
import { slugify } from "./run.js";
import { MockLLMProvider } from "../llm/mock.js";
import { LocalFileStorageAdapter } from "../storage/localFile.js";

function item(overrides: Partial<RawItem>): RawItem {
  return {
    outlet: "Outlet",
    url: "https://example.com/x",
    title: "Untitled",
    summary: "",
    publishedAt: "2026-07-10T00:00:00.000Z",
    category: "world",
    guid: randomUUID(),
    ...overrides,
  };
}

/** Two-outlet coverage of the same event — the minimum needed to clear both cluster and 2-source gates. */
function twoOutletEvent(title: string, summaryA: string, summaryB: string, category: RawItem["category"]) {
  return [
    item({ outlet: "Outlet A", title, summary: summaryA, category }),
    item({ outlet: "Outlet B", title, summary: summaryB, category }),
  ];
}

describe("pipeline e2e (mock LLM, real stage functions, structural checks only)", () => {
  it("runs collect-less pipeline stages end-to-end and produces review-status articles with all fields populated", async () => {
    const llm = new MockLLMProvider();

    const items: RawItem[] = [
      ...twoOutletEvent(
        "Central bank raises interest rates amid inflation concerns",
        "The central bank raised its benchmark rate by half a point on Thursday, citing persistent inflation pressures across the economy.",
        "Officials at the central bank increased the benchmark interest rate by half a percentage point Thursday, pointing to ongoing inflation pressures.",
        "business",
      ),
      ...twoOutletEvent(
        "Major earthquake strikes coastal region, dozens reported dead",
        "A powerful earthquake struck the coastal region early Thursday, killing dozens and damaging thousands of homes across the area.",
        "Dozens were killed after a major earthquake hit the coastal region Thursday morning, with widespread damage reported to homes and roads.",
        "world",
      ),
    ];

    // [2] cluster
    const clusters = await clusterEvents(items, { llm });
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    expect(clusters.every((c) => c.outletCount === 2)).toBe(true);

    // [3] select top 10 (both clusters have 2 outlets, so both are eligible)
    const top10 = await selectTop10(clusters, llm);
    expect(top10.selected.length).toBe(clusters.length);
    expect(top10.heldBack.length).toBe(0);
    for (const s of top10.selected) {
      expect(s.rankInEdition).toBeGreaterThanOrEqual(1);
    }

    // [4]-[6] per event: extract -> rewrite -> gate
    const articles: PipelineArticle[] = [];
    for (const event of top10.selected) {
      const { facts } = await extractFacts(event, llm);
      expect(facts.length).toBeGreaterThan(0);

      const rewrite = await rewriteAllLevels(event.id, event.category, facts, llm);
      expect(rewrite.versions.map((v) => v.level).sort()).toEqual(["A2", "B1", "B2"]);

      const gatedVersions = [];
      for (const version of rewrite.versions) {
        const gated = await gateVersion(event.id, event.category, version, facts, event.items, llm);
        expect(gated.checks.map((c) => c.kind).sort()).toEqual(
          ["cefr", "ngram_overlap", "two_source", "word_match"].sort(),
        );
        gatedVersions.push(gated);
      }

      articles.push({
        id: event.id,
        slug: slugify(gatedVersions[0].version.title, event.rankInEdition),
        category: event.category,
        rankInEdition: event.rankInEdition,
        status: "review", // pipeline must never write beyond 'review'
        eventSummary: event.title,
        sources: event.items.map((i) => ({
          url: i.url,
          outlet: i.outlet,
          title: i.title,
          fetchMethod: "rss_summary" as const,
        })),
        facts,
        versions: gatedVersions,
        createdAt: new Date().toISOString(),
      });
    }

    // Structural assertions only — never assert exact mock prose (that's an
    // implementation detail of MockLLMProvider's templating, not a contract).
    expect(articles.length).toBe(clusters.length);
    for (const article of articles) {
      expect(article.status).toBe("review");
      expect(article.versions).toHaveLength(3);
      expect(new Set(article.versions.map((v) => v.version.level))).toEqual(
        new Set(["A2", "B1", "B2"]),
      );
      expect(article.sources.length).toBe(2);
      expect(article.slug).toMatch(/-\d+$/); // rank suffix present
      for (const gated of article.versions) {
        expect(gated.version.content.length).toBeGreaterThan(0);
        expect(gated.checks.length).toBe(4);
      }
    }

    // [store] — exercise the same LocalFileStorageAdapter used by runPipeline,
    // round-tripping the assembled edition to confirm shape survives storage.
    const edition: PipelineEdition = {
      id: randomUUID(),
      editionDate: "2026-07-10",
      status: "draft",
      articles,
    };
    const storage = new LocalFileStorageAdapter();
    await storage.saveEdition(edition);
    const loaded = await storage.getEdition(edition.editionDate);

    expect(loaded).not.toBeNull();
    expect(loaded!.articles.length).toBe(articles.length);
    expect(loaded!.articles.every((a) => a.status === "review")).toBe(true);

    // cleanup the file this test wrote (shares OUTPUT_ROOT with localFile.test.ts).
    const outputRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../output");
    await rm(path.join(outputRoot, "editions", `${edition.editionDate}.json`), { force: true });
  });
});
