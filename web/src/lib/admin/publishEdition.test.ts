/**
 * publishEdition is the one function in the console that touches the public
 * seed — the files the reader-facing app serves. Everything here runs against
 * real files in a temp dir (both the pipeline edition it reads and the seed it
 * overwrites), because the risk this covers is a bad *write*: a re-publish
 * that duplicates rows, or one that takes another edition's rows down with it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PipelineArticle, PipelineEdition } from "./pipelineTypes";

type PublishEditionModule = typeof import("./publishEdition");

type SeedRow = Record<string, unknown>;

const DATE = "2026-07-13";

function makeArticle(overrides: Partial<PipelineArticle> = {}): PipelineArticle {
  return {
    id: "art-1",
    slug: "slug-1",
    category: "world",
    rankInEdition: 1,
    status: "review",
    eventSummary: "An event happened.",
    sources: [
      {
        url: "https://example.com/a",
        outlet: "Reuters",
        title: "Source title",
        fetchMethod: "rss",
      },
    ],
    facts: [
      {
        statement: "The event happened.",
        confirmedByOutlets: ["Reuters"],
        sourceCount: 1,
        usedInText: true,
        searchSummaryOnly: false,
      },
    ],
    versions: [
      {
        version: {
          level: "A2",
          title: "A Simple Title",
          content: "The event happened. People watched.",
          wordCount: 6,
          words: [
            {
              term: "event",
              meaningKo: "사건",
              example: "The event happened.",
              pronunciation: "/ɪˈvent/",
              sortOrder: 1,
            },
          ],
        },
        checks: [{ kind: "cefr", passed: true, score: 1, detail: {} }],
        passed: true,
        rewriteAttempts: 1,
      },
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    reviewDecision: "approved",
    ...overrides,
  };
}

function heldArticle(id: string, rank: number): PipelineArticle {
  return makeArticle({
    id,
    rankInEdition: rank,
    reviewDecision: "approved",
    versions: [
      {
        version: { level: "A2", title: "T", content: "C.", wordCount: 1, words: [] },
        checks: [{ kind: "two_source", passed: false, score: 0, detail: {} }],
        passed: false,
        rewriteAttempts: 3,
      },
    ],
  });
}

describe("publishEdition", () => {
  let tmpDir: string;
  let seedDir: string;
  let editionsDir: string;
  let publishEdition: PublishEditionModule["publishEdition"];
  let PublishError: PublishEditionModule["PublishError"];

  async function writeEdition(edition: PipelineEdition) {
    await writeFile(
      path.join(editionsDir, `${edition.editionDate}.json`),
      JSON.stringify(edition, null, 2),
      "utf-8"
    );
  }

  function makeEdition(overrides: Partial<PipelineEdition> = {}): PipelineEdition {
    return {
      id: `edition-${DATE}`,
      editionDate: DATE,
      status: "draft",
      articles: [makeArticle()],
      ...overrides,
    };
  }

  async function readSeed(file: string): Promise<SeedRow[]> {
    return JSON.parse(await readFile(path.join(seedDir, file), "utf-8")) as SeedRow[];
  }

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "briefly-publish-test-"));
    seedDir = path.join(tmpDir, "src", "lib", "data", "seed");
    editionsDir = path.join(tmpDir, "pipeline-output", "editions");
    await mkdir(seedDir, { recursive: true });
    await mkdir(editionsDir, { recursive: true });

    // A previously-published edition already in the seed — publishing a
    // different date must not disturb it.
    await writeFile(
      path.join(seedDir, "categories.json"),
      JSON.stringify([
        { id: 1, slug: "world" },
        { id: 2, slug: "korea" },
      ]),
      "utf-8"
    );
    await writeFile(
      path.join(seedDir, "articles.json"),
      JSON.stringify([{ id: "article-2026-07-01-1", edition_id: "edition-2026-07-01" }]),
      "utf-8"
    );
    await writeFile(
      path.join(seedDir, "editions.json"),
      JSON.stringify([{ id: "edition-2026-07-01", edition_date: "2026-07-01" }]),
      "utf-8"
    );
    for (const file of [
      "article_versions.json",
      "words.json",
      "facts.json",
      "sources.json",
      "fact_sources.json",
    ]) {
      await writeFile(path.join(seedDir, file), "[]", "utf-8");
    }

    // paths.ts resolves the seed dir from cwd at import time, so both the
    // spy and the env override have to be in place before the dynamic import.
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    process.env.PIPELINE_OUTPUT_DIR = path.join(tmpDir, "pipeline-output");
    vi.resetModules();
    ({ publishEdition, PublishError } = await import("./publishEdition"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.PIPELINE_OUTPUT_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("refuses to publish", () => {
    it("an edition that doesn't exist", async () => {
      await expect(publishEdition("2099-01-01")).rejects.toBeInstanceOf(PublishError);
    });

    it("an edition with nothing approved — and writes nothing while refusing", async () => {
      await writeEdition(makeEdition({ articles: [makeArticle({ reviewDecision: "pending" })] }));
      await expect(publishEdition(DATE)).rejects.toThrow(/승인된 기사가 없습니다/);
      expect(await readSeed("articles.json")).toHaveLength(1); // only the old edition's row
    });

    it("an approved article that is still gate-held (hand-edited edition file)", async () => {
      await writeEdition(makeEdition({ articles: [heldArticle("art-held", 1)] }));
      await expect(publishEdition(DATE)).rejects.toThrow(/보류\(held\)/);
      expect(await readSeed("article_versions.json")).toEqual([]);
    });
  });

  describe("a successful publish", () => {
    it("writes the approved article across every seed table and marks the edition published", async () => {
      await writeEdition(makeEdition({}));

      const result = await publishEdition(DATE);
      expect(result.approvedCount).toBe(1);
      expect(result.excludedCount).toBe(0);
      expect(result.warnings).toEqual([]);

      const articles = await readSeed("articles.json");
      expect(articles.map((r) => r.id)).toEqual([
        "article-2026-07-01-1", // untouched
        `article-${DATE}-1`,
      ]);
      expect(await readSeed("article_versions.json")).toHaveLength(1);
      expect(await readSeed("words.json")).toHaveLength(1);
      expect(await readSeed("facts.json")).toHaveLength(1);
      expect(await readSeed("sources.json")).toHaveLength(1);
      expect(await readSeed("fact_sources.json")).toHaveLength(1);

      const editions = await readSeed("editions.json");
      expect(editions.map((r) => r.id)).toEqual(["edition-2026-07-01", `edition-${DATE}`]);

      const stored = JSON.parse(
        await readFile(path.join(editionsDir, `${DATE}.json`), "utf-8")
      ) as PipelineEdition;
      expect(stored.status).toBe("published");
      expect(stored.publishedAt).toBe(result.publishedAt);
    });

    it("leaves excluded articles out of the seed but counts them", async () => {
      await writeEdition(
        makeEdition({
          articles: [
            makeArticle({ id: "art-1", rankInEdition: 1 }),
            makeArticle({
              id: "art-2",
              rankInEdition: 2,
              reviewDecision: "excluded",
              excludeReason: "중복",
            }),
          ],
        })
      );

      const result = await publishEdition(DATE);
      expect(result.approvedCount).toBe(1);
      expect(result.excludedCount).toBe(1);
      const ids = (await readSeed("articles.json")).map((r) => r.id);
      expect(ids).not.toContain(`article-${DATE}-2`);
    });

    it("surfaces the transform's warnings instead of hiding them", async () => {
      await writeEdition(makeEdition({ leadArticleId: "not-approved" }));
      const result = await publishEdition(DATE);
      expect(result.warnings.join(" ")).toMatch(/1면/);
    });
  });

  describe("re-publishing", () => {
    it("replaces this edition's rows rather than duplicating them", async () => {
      await writeEdition(makeEdition({}));
      await publishEdition(DATE);
      const first = await readSeed("articles.json");

      await publishEdition(DATE);
      const second = await readSeed("articles.json");

      expect(second).toHaveLength(first.length);
      expect(second.filter((r) => r.id === `article-${DATE}-1`)).toHaveLength(1);
      expect(await readSeed("words.json")).toHaveLength(1);
      expect(await readSeed("fact_sources.json")).toHaveLength(1);
    });

    it("drops the rows of an article excluded since the last publish", async () => {
      await writeEdition(
        makeEdition({
          articles: [
            makeArticle({ id: "art-1", rankInEdition: 1 }),
            makeArticle({ id: "art-2", rankInEdition: 2 }),
          ],
        })
      );
      await publishEdition(DATE);
      expect(await readSeed("articles.json")).toHaveLength(3);

      await writeEdition(
        makeEdition({
          status: "published",
          articles: [
            makeArticle({ id: "art-1", rankInEdition: 1 }),
            makeArticle({
              id: "art-2",
              rankInEdition: 2,
              reviewDecision: "excluded",
              excludeReason: "오보",
            }),
          ],
        })
      );
      await publishEdition(DATE);

      const ids = (await readSeed("articles.json")).map((r) => r.id);
      expect(ids).toContain(`article-${DATE}-1`);
      expect(ids).not.toContain(`article-${DATE}-2`);
      // The rows hanging off the removed article go with it.
      const versionArticleIds = (await readSeed("article_versions.json")).map((r) => r.article_id);
      expect(versionArticleIds).not.toContain(`article-${DATE}-2`);
      expect(await readSeed("words.json")).toHaveLength(1);
      expect(await readSeed("sources.json")).toHaveLength(1);
    });

    it("never touches another edition's rows", async () => {
      await writeEdition(makeEdition({}));
      await publishEdition(DATE);
      await publishEdition(DATE);

      const others = (await readSeed("articles.json")).filter(
        (r) => r.edition_id === "edition-2026-07-01"
      );
      expect(others).toEqual([{ id: "article-2026-07-01-1", edition_id: "edition-2026-07-01" }]);
      const editions = (await readSeed("editions.json")).filter(
        (r) => r.id === "edition-2026-07-01"
      );
      expect(editions).toHaveLength(1);
    });
  });
});
