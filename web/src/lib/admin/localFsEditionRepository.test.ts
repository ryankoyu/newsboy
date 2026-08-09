import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EditionRepository } from "./editionRepository";
import type { PipelineArticle, PipelineEdition } from "./pipelineTypes";

function makeArticle(overrides: Partial<PipelineArticle>): PipelineArticle {
  return {
    id: "art-1",
    slug: "slug-1",
    category: "world",
    rankInEdition: 1,
    status: "review",
    eventSummary: "summary",
    sources: [],
    facts: [],
    versions: [
      {
        version: { level: "A2", title: "T", content: "C", wordCount: 10, words: [] },
        checks: [{ kind: "cefr", passed: true, score: 0, detail: {} }],
        passed: true,
        rewriteAttempts: 1,
      },
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeEdition(overrides: Partial<PipelineEdition>): PipelineEdition {
  return {
    id: "edition-2026-07-13",
    editionDate: "2026-07-13",
    status: "draft",
    articles: [makeArticle({})],
    ...overrides,
  };
}

describe("localFsEditionRepository", () => {
  let tmpDir: string;
  let repo: EditionRepository;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "briefly-admin-test-"));
    await mkdir(path.join(tmpDir, "editions"), { recursive: true });
    process.env.PIPELINE_OUTPUT_DIR = tmpDir;
    vi.resetModules();
    ({ localFsEditionRepository: repo } = await import("./localFsEditionRepository"));
  });

  afterEach(async () => {
    delete process.env.PIPELINE_OUTPUT_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeEdition(edition: PipelineEdition) {
    await writeFile(
      path.join(tmpDir, "editions", `${edition.editionDate}.json`),
      JSON.stringify(edition, null, 2),
      "utf-8"
    );
  }

  it("returns null for a missing edition", async () => {
    expect(await repo.getEdition("2099-01-01")).toBeNull();
  });

  it("returns an empty list when the editions dir has no files", async () => {
    expect(await repo.listEditions()).toEqual([]);
  });

  it("reads back a written edition unchanged", async () => {
    await writeEdition(makeEdition({}));
    const edition = await repo.getEdition("2026-07-13");
    expect(edition?.editionDate).toBe("2026-07-13");
    expect(edition?.articles).toHaveLength(1);
  });

  it("setArticleDecision(approved) persists reviewDecision and clears any exclude reason", async () => {
    await writeEdition(makeEdition({}));
    const updated = await repo.setArticleDecision("2026-07-13", "art-1", "approved");
    expect(updated.articles[0].reviewDecision).toBe("approved");
    expect(updated.articles[0].excludeReason).toBeUndefined();

    // Persisted to disk, not just returned in-memory.
    const reread = await repo.getEdition("2026-07-13");
    expect(reread?.articles[0].reviewDecision).toBe("approved");
  });

  it("setArticleDecision(approved) throws when the article is held (gate failure)", async () => {
    await writeEdition(
      makeEdition({
        articles: [
          makeArticle({
            versions: [
              {
                version: { level: "A2", title: "T", content: "C", wordCount: 10, words: [] },
                checks: [{ kind: "cefr", passed: false, score: 0, detail: {} }],
                passed: false,
                rewriteAttempts: 3,
              },
            ],
          }),
        ],
      })
    );
    await expect(repo.setArticleDecision("2026-07-13", "art-1", "approved")).rejects.toThrow(/held/i);
  });

  it("setArticleDecision(excluded) requires a non-empty reason", async () => {
    await writeEdition(makeEdition({}));
    await expect(repo.setArticleDecision("2026-07-13", "art-1", "excluded")).rejects.toThrow(/excludeReason/i);
    await expect(repo.setArticleDecision("2026-07-13", "art-1", "excluded", "   ")).rejects.toThrow(
      /excludeReason/i
    );
  });

  it("setArticleDecision(excluded) with a reason persists it, trimmed", async () => {
    await writeEdition(makeEdition({}));
    const updated = await repo.setArticleDecision("2026-07-13", "art-1", "excluded", "  중복 기사  ");
    expect(updated.articles[0].reviewDecision).toBe("excluded");
    expect(updated.articles[0].excludeReason).toBe("중복 기사");
  });

  it("setEditionStatus(published) sets publishedAt; (draft) clears it", async () => {
    await writeEdition(makeEdition({}));
    const published = await repo.setEditionStatus("2026-07-13", "published", "2026-07-14T00:00:00.000Z");
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe("2026-07-14T00:00:00.000Z");

    const reverted = await repo.setEditionStatus("2026-07-13", "draft");
    expect(reverted.status).toBe("draft");
    expect(reverted.publishedAt).toBeUndefined();
  });

  it("listEditions aggregates decision + held counts across articles, newest date first", async () => {
    await writeEdition(
      makeEdition({
        editionDate: "2026-07-13",
        articles: [
          makeArticle({ id: "a1", reviewDecision: "approved" }),
          makeArticle({ id: "a2", rankInEdition: 2, reviewDecision: "excluded", excludeReason: "x" }),
          makeArticle({ id: "a3", rankInEdition: 3 }),
        ],
      })
    );
    await writeEdition(makeEdition({ editionDate: "2026-07-14", articles: [makeArticle({ id: "b1" })] }));

    const list = await repo.listEditions();
    expect(list.map((e) => e.editionDate)).toEqual(["2026-07-14", "2026-07-13"]);

    const jul13 = list.find((e) => e.editionDate === "2026-07-13")!;
    expect(jul13.approvedCount).toBe(1);
    expect(jul13.excludedCount).toBe(1);
    expect(jul13.pendingCount).toBe(1);
    expect(jul13.articleCount).toBe(3);
  });
});
