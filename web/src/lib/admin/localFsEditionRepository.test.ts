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

  describe("setLeadArticle — the front page takes the same bars as approval", () => {
    it("stores the chosen id and clears it again with null", async () => {
      await writeEdition(
        makeEdition({
          articles: [makeArticle({ id: "a1" }), makeArticle({ id: "a2", rankInEdition: 2 })],
        })
      );

      await repo.setLeadArticle("2026-07-13", "a2");
      expect((await repo.getEdition("2026-07-13"))?.leadArticleId).toBe("a2");

      await repo.setLeadArticle("2026-07-13", null);
      expect((await repo.getEdition("2026-07-13"))?.leadArticleId).toBeNull();
    });

    it("refuses an article that isn't in the edition", async () => {
      await writeEdition(makeEdition({}));
      await expect(repo.setLeadArticle("2026-07-13", "ghost")).rejects.toThrow(/not found/i);
      expect((await repo.getEdition("2026-07-13"))?.leadArticleId).toBeUndefined();
    });

    it("refuses a gate-held article, leaving the previous lead in place", async () => {
      await writeEdition(
        makeEdition({
          leadArticleId: "a1",
          articles: [
            makeArticle({ id: "a1" }),
            makeArticle({
              id: "a2",
              rankInEdition: 2,
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

      await expect(repo.setLeadArticle("2026-07-13", "a2")).rejects.toThrow(/보류/);
      expect((await repo.getEdition("2026-07-13"))?.leadArticleId).toBe("a1");
    });

    it("refuses an excluded article", async () => {
      await writeEdition(
        makeEdition({
          articles: [makeArticle({ id: "a1", reviewDecision: "excluded", excludeReason: "중복" })],
        })
      );
      await expect(repo.setLeadArticle("2026-07-13", "a1")).rejects.toThrow(/제외/);
      expect((await repo.getEdition("2026-07-13"))?.leadArticleId).toBeUndefined();
    });

    it("refuses when the edition doesn't exist", async () => {
      await expect(repo.setLeadArticle("2099-01-01", "a1")).rejects.toThrow(/Edition not found/);
    });
  });

  describe("approveAllPending", () => {
    function heldArticle(id: string, rank: number): PipelineArticle {
      return makeArticle({
        id,
        rankInEdition: rank,
        versions: [
          {
            version: { level: "A2", title: "T", content: "C", wordCount: 10, words: [] },
            checks: [{ kind: "two_source", passed: false, score: 0, detail: {} }],
            passed: false,
            rewriteAttempts: 3,
          },
        ],
      });
    }

    it("approves the undecided ones and leaves every existing decision alone", async () => {
      await writeEdition(
        makeEdition({
          articles: [
            makeArticle({ id: "pending-1" }),
            makeArticle({ id: "pending-2", rankInEdition: 2 }),
            makeArticle({ id: "approved-1", rankInEdition: 3, reviewDecision: "approved" }),
            makeArticle({
              id: "excluded-1",
              rankInEdition: 4,
              reviewDecision: "excluded",
              excludeReason: "중복 기사",
            }),
            heldArticle("held-1", 5),
          ],
        })
      );

      const result = await repo.approveAllPending("2026-07-13");
      expect(result.approved).toBe(2);
      expect(result.skipped.map((s) => s.id).sort()).toEqual(["excluded-1", "held-1"]);

      const byId = Object.fromEntries(
        (await repo.getEdition("2026-07-13"))!.articles.map((a) => [a.id, a])
      );
      expect(byId["pending-1"].reviewDecision).toBe("approved");
      expect(byId["pending-2"].reviewDecision).toBe("approved");
      expect(byId["approved-1"].reviewDecision).toBe("approved");
      // An operator's exclusion survives a bulk approve, reason and all.
      expect(byId["excluded-1"].reviewDecision).toBe("excluded");
      expect(byId["excluded-1"].excludeReason).toBe("중복 기사");
      expect(byId["held-1"].reviewDecision).toBeUndefined();
    });

    it("names why each skipped article was skipped, with its rank", async () => {
      await writeEdition(
        makeEdition({
          articles: [
            makeArticle({
              id: "excluded-1",
              rankInEdition: 4,
              reviewDecision: "excluded",
              excludeReason: "중복",
            }),
            heldArticle("held-1", 5),
          ],
        })
      );

      const { skipped } = await repo.approveAllPending("2026-07-13");
      expect(skipped).toEqual([
        { id: "excluded-1", rankInEdition: 4, reason: "이미 제외함" },
        { id: "held-1", rankInEdition: 5, reason: expect.stringContaining("보류") },
      ]);
    });

    it("is a no-op that still reports zero when there is nothing to approve", async () => {
      await writeEdition(
        makeEdition({ articles: [makeArticle({ id: "a1", reviewDecision: "approved" })] })
      );
      const result = await repo.approveAllPending("2026-07-13");
      expect(result).toEqual({ approved: 0, skipped: [] });
    });

    it("refuses when the edition doesn't exist", async () => {
      await expect(repo.approveAllPending("2099-01-01")).rejects.toThrow(/Edition not found/);
    });
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
