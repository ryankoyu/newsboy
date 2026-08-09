import { describe, expect, it } from "vitest";
import { ALL_CHECK_KINDS, checkBadgeState, deriveGateStatus, findCheck } from "./gateStatus";
import type { GatedVersion, PipelineArticle, QualityCheckResult } from "./pipelineTypes";

function makeCheck(overrides: Partial<QualityCheckResult>): QualityCheckResult {
  return { kind: "cefr", level: "A2", score: 0, passed: true, detail: {}, ...overrides };
}

function makeVersion(overrides: Partial<GatedVersion>): GatedVersion {
  return {
    version: { level: "A2", title: "T", content: "C", wordCount: 150, words: [] },
    checks: [makeCheck({})],
    passed: true,
    rewriteAttempts: 1,
    ...overrides,
  };
}

function makeArticle(overrides: Partial<PipelineArticle>): PipelineArticle {
  return {
    id: "a1",
    slug: "a1",
    category: "world",
    rankInEdition: 1,
    status: "review",
    eventSummary: "summary",
    sources: [],
    facts: [],
    versions: [makeVersion({})],
    createdAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("checkBadgeState", () => {
  it("returns not_run when the check kind is absent", () => {
    expect(checkBadgeState(undefined)).toBe("not_run");
  });

  it("returns pass/fail from the passed boolean", () => {
    expect(checkBadgeState(makeCheck({ passed: true }))).toBe("pass");
    expect(checkBadgeState(makeCheck({ passed: false }))).toBe("fail");
  });

  it("returns ambiguous when cefr heuristic flags itself as ambiguous, even if passed", () => {
    const check = makeCheck({
      passed: true,
      detail: { heuristic: { ambiguous: true } },
    });
    expect(checkBadgeState(check)).toBe("ambiguous");
  });
});

describe("findCheck", () => {
  it("finds a check by kind", () => {
    const version = makeVersion({ checks: [makeCheck({ kind: "cefr" }), makeCheck({ kind: "word_match" })] });
    expect(findCheck(version, "word_match")?.kind).toBe("word_match");
    expect(findCheck(version, "word_count")).toBeUndefined();
  });
});

describe("deriveGateStatus", () => {
  it("is clear when every check on every version passes and status isn't held", () => {
    const article = makeArticle({});
    expect(deriveGateStatus(article)).toEqual({ status: "clear", reasons: [] });
  });

  it("is held when any check fails on any version — real 2026-07-13 rank-1 scenario", () => {
    // Mirrors the real pipeline/output/editions/2026-07-13.json rank-1 article:
    // status stays "review" (not "held") even though B1's cefr check failed.
    const article = makeArticle({
      status: "review",
      versions: [
        makeVersion({ version: { level: "A2", title: "T", content: "C", wordCount: 150, words: [] } }),
        makeVersion({
          version: { level: "B1", title: "T", content: "C", wordCount: 300, words: [] },
          checks: [makeCheck({ kind: "cefr", passed: false })],
          passed: false,
        }),
      ],
    });
    const result = deriveGateStatus(article);
    expect(result.status).toBe("held");
    expect(result.reasons.some((r) => r.includes("B1") && r.includes("cefr"))).toBe(true);
  });

  it("is held when the pipeline itself marked the article status held", () => {
    const article = makeArticle({ status: "held" });
    const result = deriveGateStatus(article);
    expect(result.status).toBe("held");
    expect(result.reasons.some((r) => r.includes("held"))).toBe(true);
  });

  it("is held on an ambiguous-but-passed cefr check", () => {
    const article = makeArticle({
      versions: [
        makeVersion({
          checks: [makeCheck({ kind: "cefr", passed: true, detail: { heuristic: { ambiguous: true } } })],
          passed: true,
        }),
      ],
    });
    expect(deriveGateStatus(article).status).toBe("held");
  });

  it("lists every check kind the review UI badges", () => {
    expect(ALL_CHECK_KINDS).toEqual(["cefr", "ngram_overlap", "two_source", "word_match", "word_count"]);
  });
});
