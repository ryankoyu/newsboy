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
import type { EventCluster, PipelineArticle, PipelineEdition, RawItem } from "../types.js";
import { clusterEvents } from "./cluster.js";
import { selectTop10 } from "./selectTop10.js";
import { extractFacts } from "./extract.js";
import { rewriteAllLevels } from "./rewrite.js";
import { gateVersion } from "./gate.js";
import { articleStatusForGatedVersions, slugify } from "./run.js";
import { resolveUsableEvents } from "./replaceLowUsableFacts.js";
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
          ["cefr", "ngram_overlap", "two_source", "word_match", "word_count"].sort(),
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
        // cefr, ngram_overlap, two_source, word_match, word_count — see
        // gates/wordCount.ts (docs/feature-status.md G6).
        expect(gated.checks.length).toBe(5);
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

  /**
   * Reproduces the 2026-07-14 incident (Texas-economy rank-7 article): a
   * cluster whose raw items clear the cluster-level outletCount>=2 bar, but
   * whose extracted facts are each confirmed by only ONE outlet (e.g. 7 RSS
   * items that are really 2 distinct underlying articles — "best states" /
   * "worst states" — each covered by several feeds, so no single sentence
   * had 2 independent-outlet corroboration). Before the fix, this event
   * proceeded straight to rewrite with usable=0 and the two_source gate
   * still passed trivially (0 load-bearing facts = 0 violations). This test
   * proves the fixed pipeline: (a) resolveUsableEvents blocks the event
   * BEFORE any rewrite call and swaps in the next-best same-category
   * heldBack candidate, and (b) if a genuinely-unconfirmed event somehow
   * still reached rewrite/gate, articleStatusForGatedVersions would flag the
   * whole article 'held' rather than publishing it under 'review'.
   */
  it("blocks a single-source-only event before rewrite and replaces it with a heldBack candidate", async () => {
    const llm = new MockLLMProvider();

    // The "Texas economy" event: 3 outlets, each reporting a LEXICALLY
    // DISTINCT sentence (mirrors the real incident's "best states" /
    // "worst states" / "methodology" split) — MockLLMProvider's
    // sentence-level grouping never merges them, so every fact ends up
    // confirmedByOutlets.length === 1, i.e. usable=0.
    const singleSourceItems: RawItem[] = [
      item({
        outlet: "CNBC Top News",
        outletKey: "cnbc",
        title: "The 10 best state economies in America in 2026",
        summary: "CNBC's Top States for Business study treats the state economy as one of its most significant ranking categories for business climate.",
        category: "business",
      }),
      item({
        outlet: "Google News (Economy)",
        outletKey: "google-news-economy",
        title: "The 10 worst state economies in America in 2026",
        summary: "CNBC also compiled a separate list highlighting the states with the weakest economic performance this year.",
        category: "business",
      }),
      item({
        outlet: "24/7 Wall St.",
        outletKey: "247wallst",
        title: "New Study Reveals Strongest State Economies",
        summary: "According to the 24/7 Wall St. report on the study, one state's economy ranked second nationally, trailing only one other state.",
        category: "business",
      }),
    ];

    // A healthy same-category heldBack candidate: 2 outlets independently
    // reporting overlapping sentences, so it clears the usable-fact bar.
    const healthySummaryA =
      "The central bank raised interest rates by half a point on Thursday citing inflation concerns across the economy. " +
      "Officials said the move was intended to slow consumer price growth over the coming months. " +
      "Markets reacted with a modest decline in major stock indexes following the announcement.";
    const healthySummaryB =
      "The central bank increased interest rates by half a point Thursday, pointing to inflation concerns across the economy. " +
      "Officials stated the move was meant to slow consumer price growth over the coming months. " +
      "Stock markets showed a modest decline in major indexes after the announcement was made.";
    const replacementItems: RawItem[] = [
      item({ outlet: "Outlet X", outletKey: "outlet-x", title: "Central bank raises rates", summary: healthySummaryA, category: "business" }),
      item({ outlet: "Outlet Y", outletKey: "outlet-y", title: "Central bank raises rates", summary: healthySummaryB, category: "business" }),
    ];

    const singleSourceCluster: EventCluster = {
      id: randomUUID(),
      title: "The 10 best state economies in America in 2026",
      category: "business",
      items: singleSourceItems,
      outletCount: 3, // clears selectTop10's raw outletCount>=2 gate — this is the point of the incident.
      outletKeys: ["cnbc", "google-news-economy", "247wallst"],
      countries: ["US"],
      earliestPublishedAt: "2026-07-13T06:00:00.000Z",
      latestPublishedAt: "2026-07-13T06:00:00.000Z",
    };
    const replacementCluster: EventCluster = {
      id: randomUUID(),
      title: "Central bank raises interest rates",
      category: "business",
      items: replacementItems,
      outletCount: 2,
      outletKeys: ["outlet-x", "outlet-y"],
      countries: ["US"],
      earliestPublishedAt: "2026-07-13T06:00:00.000Z",
      latestPublishedAt: "2026-07-13T06:00:00.000Z",
    };

    const selectedEvent = { ...singleSourceCluster, rankInEdition: 7, selectionRationale: "score=1.0" };

    // Sanity check: extraction alone really does yield usable=0 for this
    // fixture (i.e. we're reproducing the incident's actual failure mode,
    // not a strawman).
    const { facts: rawFacts } = await extractFacts(singleSourceCluster, llm);
    expect(rawFacts.filter((f) => f.usedInText)).toHaveLength(0);

    // [4]+ pre-rewrite block/replace — the fix under test.
    const { resolved, log } = await resolveUsableEvents(
      [selectedEvent],
      [replacementCluster],
      llm,
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].event.id).toBe(replacementCluster.id); // swapped, not the original
    expect(resolved[0].event.id).not.toBe(singleSourceCluster.id);
    expect(resolved[0].facts.filter((f) => f.usedInText).length).toBeGreaterThanOrEqual(3);

    // Replacement was logged for operator review (pipeline_runs / selection-report).
    expect(log).toHaveLength(1);
    expect(log[0].droppedClusterId).toBe(singleSourceCluster.id);
    expect(log[0].replacedByClusterId).toBe(replacementCluster.id);
    expect(log[0].usableFactCount).toBe(0);

    // [5]-[6] the REPLACEMENT proceeds through rewrite/gate normally and is
    // never flagged 'held' — it has real 2-source-confirmed facts.
    const { event, facts } = resolved[0];
    const rewrite = await rewriteAllLevels(event.id, event.category, facts, llm);
    const gatedVersions = [];
    for (const version of rewrite.versions) {
      gatedVersions.push(await gateVersion(event.id, event.category, version, facts, event.items, llm));
    }
    expect(gatedVersions.every((g) => g.checks.find((c) => c.kind === "two_source")!.passed)).toBe(true);
    expect(articleStatusForGatedVersions(gatedVersions)).toBe("review");

    // Belt-and-suspenders: if the ORIGINAL single-source event had somehow
    // still reached rewrite/gate (e.g. a future regression re-opens this
    // hole), the article-level status helper must flag it 'held', not
    // 'review' — proving the second layer of defense also works.
    const badRewrite = await rewriteAllLevels(singleSourceCluster.id, singleSourceCluster.category, rawFacts, llm);
    const badGatedVersions = [];
    for (const version of badRewrite.versions) {
      badGatedVersions.push(
        await gateVersion(singleSourceCluster.id, singleSourceCluster.category, version, rawFacts, singleSourceCluster.items, llm),
      );
    }
    expect(articleStatusForGatedVersions(badGatedVersions)).toBe("held");
  });
});
