/**
 * 반려(재생성 요청) — production-readiness.md §2.
 *
 * Kept in its own file rather than appended to localFsEditionRepository.test.ts
 * because it covers one feature end-to-end at the repository layer: filing a
 * request, what it blocks, and what it deliberately does not block.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EditionRepository } from "./editionRepository";
import type { PipelineArticle, PipelineEdition } from "./pipelineTypes";

function makeArticle(overrides: Partial<PipelineArticle> = {}): PipelineArticle {
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

/** An article the gate held — it can never be approved. */
function makeHeldArticle(overrides: Partial<PipelineArticle> = {}): PipelineArticle {
  return makeArticle({
    id: "art-held",
    rankInEdition: 2,
    status: "held",
    versions: [
      {
        version: { level: "A2", title: "T", content: "C", wordCount: 10, words: [] },
        checks: [{ kind: "two_source", passed: false, score: 1, detail: {} }],
        passed: false,
        rewriteAttempts: 3,
      },
    ],
    ...overrides,
  });
}

describe("반려(재생성 요청)", () => {
  let tmpDir: string;
  let repo: EditionRepository;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "briefly-regen-test-"));
    await mkdir(path.join(tmpDir, "editions"), { recursive: true });
    process.env.PIPELINE_OUTPUT_DIR = tmpDir;
    vi.resetModules();
    ({ localFsEditionRepository: repo } = await import("./localFsEditionRepository"));
  });

  afterEach(async () => {
    delete process.env.PIPELINE_OUTPUT_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeEdition(articles: PipelineArticle[]): Promise<PipelineEdition> {
    const edition: PipelineEdition = {
      id: "edition-2026-07-13",
      editionDate: "2026-07-13",
      status: "draft",
      articles,
    };
    await writeFile(
      path.join(tmpDir, "editions", "2026-07-13.json"),
      JSON.stringify(edition, null, 2),
      "utf-8"
    );
    return edition;
  }

  it("records the note and a request timestamp the pipeline can find", async () => {
    await writeEdition([makeArticle()]);

    await repo.setArticleDecision("2026-07-13", "art-1", "regenerate", "  A2 본문이 너무 딱딱함  ");

    const raw = JSON.parse(
      await readFile(path.join(tmpDir, "editions", "2026-07-13.json"), "utf-8")
    ) as PipelineEdition;
    expect(raw.articles[0].reviewDecision).toBe("regenerate");
    expect(raw.articles[0].regenerateNote).toBe("A2 본문이 너무 딱딱함");
    expect(raw.articles[0].regenerateRequestedAt).toBeTruthy();
  });

  it("refuses a request with no note — the note is the rewrite instruction", async () => {
    await writeEdition([makeArticle()]);
    await expect(
      repo.setArticleDecision("2026-07-13", "art-1", "regenerate", "   ")
    ).rejects.toThrow(/regenerateNote/);
  });

  it("allows a request on a gate-held article, which can never be approved", async () => {
    await writeEdition([makeHeldArticle()]);

    await expect(
      repo.setArticleDecision("2026-07-13", "art-held", "approved")
    ).rejects.toThrow(/held/);

    const edition = await repo.setArticleDecision(
      "2026-07-13",
      "art-held",
      "regenerate",
      "2소스 확인 안 된 사실 빼고 다시"
    );
    expect(edition.articles[0].reviewDecision).toBe("regenerate");
  });

  it("bulk approve skips an article awaiting regeneration", async () => {
    await writeEdition([
      makeArticle({ id: "a", rankInEdition: 1 }),
      makeArticle({ id: "b", rankInEdition: 2 }),
    ]);
    await repo.setArticleDecision("2026-07-13", "b", "regenerate", "제목 다시");

    const result = await repo.approveAllPending("2026-07-13");

    expect(result.approved).toBe(1);
    expect(result.skipped).toEqual([
      { id: "b", rankInEdition: 2, reason: "재생성 요청 대기 중" },
    ]);
    const after = await repo.getEdition("2026-07-13");
    expect(after?.articles.find((a) => a.id === "b")?.reviewDecision).toBe("regenerate");
  });

  it("refuses to put an article awaiting regeneration on the front page", async () => {
    await writeEdition([makeArticle()]);
    await repo.setArticleDecision("2026-07-13", "art-1", "regenerate", "다시 써주세요");

    await expect(repo.setLeadArticle("2026-07-13", "art-1")).rejects.toThrow(/재생성/);
  });

  it("counts outstanding requests separately from 대기 in the edition list", async () => {
    await writeEdition([
      makeArticle({ id: "a", rankInEdition: 1 }),
      makeArticle({ id: "b", rankInEdition: 2 }),
      makeArticle({ id: "c", rankInEdition: 3 }),
    ]);
    await repo.setArticleDecision("2026-07-13", "a", "approved");
    await repo.setArticleDecision("2026-07-13", "b", "regenerate", "본문 다시");

    const [item] = await repo.listEditions();
    expect(item.approvedCount).toBe(1);
    expect(item.regenerateCount).toBe(1);
    expect(item.pendingCount).toBe(1);
  });

  it("clears the outstanding-request marker when the decision moves on", async () => {
    await writeEdition([makeArticle()]);
    await repo.setArticleDecision("2026-07-13", "art-1", "regenerate", "본문 다시");

    const edition = await repo.setArticleDecision("2026-07-13", "art-1", "pending");

    expect(edition.articles[0].regenerateRequestedAt).toBeUndefined();
    // The note survives as history of why this article was reworked.
    expect(edition.articles[0].regenerateNote).toBe("본문 다시");
  });
});

/**
 * The publish path's own fixture: publishEdition writes the reader-facing
 * seed, so it needs a seed directory to write into. Kept separate from the
 * repository suite above because it needs a different cwd/paths setup.
 */
describe("발행 시 재생성 요청 경고", () => {
  let tmpDir: string;
  let seedDir: string;
  let editionsDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "briefly-regen-publish-"));
    seedDir = path.join(tmpDir, "src", "lib", "data", "seed");
    editionsDir = path.join(tmpDir, "pipeline-output", "editions");
    await mkdir(seedDir, { recursive: true });
    await mkdir(editionsDir, { recursive: true });

    await writeFile(
      path.join(seedDir, "categories.json"),
      JSON.stringify([{ id: 1, slug: "world" }]),
      "utf-8"
    );
    for (const file of [
      "articles.json",
      "article_versions.json",
      "words.json",
      "facts.json",
      "sources.json",
      "fact_sources.json",
      "editions.json",
    ]) {
      await writeFile(path.join(seedDir, file), "[]", "utf-8");
    }

    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    process.env.PIPELINE_OUTPUT_DIR = path.join(tmpDir, "pipeline-output");
    vi.resetModules();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.PIPELINE_OUTPUT_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("tells the operator which articles the publish left behind", async () => {
    const edition: PipelineEdition = {
      id: "edition-2026-07-13",
      editionDate: "2026-07-13",
      status: "draft",
      articles: [
        makeArticle({ id: "a", rankInEdition: 1, reviewDecision: "approved" }),
        makeArticle({
          id: "b",
          rankInEdition: 2,
          reviewDecision: "regenerate",
          regenerateNote: "본문 다시",
        }),
      ],
    };
    await writeFile(
      path.join(editionsDir, "2026-07-13.json"),
      JSON.stringify(edition, null, 2),
      "utf-8"
    );

    const { publishEdition } = await import("./publishEdition");
    const result = await publishEdition("2026-07-13");

    expect(result.approvedCount).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/재생성 요청 대기 1건/);
    expect(result.warnings.join(" ")).toContain("#2");
  });
});
