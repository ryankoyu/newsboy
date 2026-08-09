import { describe, expect, it } from "vitest";
import { matchSelectionCandidate } from "./selectionReport";
import type { CandidateReportEntry, PipelineArticle, SelectionReport } from "./pipelineTypes";

function makeCandidate(overrides: Partial<CandidateReportEntry>): CandidateReportEntry {
  return {
    id: "cand-1",
    title: "Apple sues OpenAI over alleged trade secret theft",
    category: "ai-tech",
    outletCount: 3,
    outletKeys: [],
    countries: [],
    score: 1.65,
    scoreBreakdown: { sourceDiversity: 1 },
    isPolitical: false,
    isCasualty: false,
    subjectKey: "apple-openai",
    outcome: "selected",
    rank: 9,
    rejectionReasons: [],
    ...overrides,
  };
}

function makeArticle(overrides: Partial<PipelineArticle>): PipelineArticle {
  return {
    id: "art-1",
    slug: "s",
    category: "ai-tech",
    rankInEdition: 9,
    status: "review",
    eventSummary: "Apple sues OpenAI, alleging theft of trade secrets by a former employee.",
    sources: [],
    facts: [],
    versions: [],
    createdAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

function makeReport(candidates: CandidateReportEntry[]): SelectionReport {
  return {
    editionDate: "2026-07-13",
    generatedAt: "2026-07-13T00:00:00.000Z",
    quota: {},
    candidates,
    backfills: [],
    finalOrder: [],
    limitations: [],
  };
}

describe("matchSelectionCandidate", () => {
  it("matches when rank agrees and titles share real vocabulary overlap", () => {
    const report = makeReport([makeCandidate({})]);
    const match = matchSelectionCandidate(makeArticle({}), report);
    expect(match?.candidate.id).toBe("cand-1");
  });

  it("does not match when rank disagrees, even with identical titles", () => {
    const report = makeReport([makeCandidate({ rank: 3 })]);
    const match = matchSelectionCandidate(makeArticle({ rankInEdition: 9 }), report);
    expect(match).toBeNull();
  });

  it("does not match when rank agrees but titles are unrelated (real 2026-07-13 mismatch scenario)", () => {
    // Mirrors the real data: selection-report-2026-07-13.json rank 1 is
    // "N. Korean premier's China trip…" but editions/2026-07-13.json rank 1
    // is "Korea Plans New Fund for Chip and AI Projects" — different runs,
    // same date. Must not silently attach the wrong score.
    const report = makeReport([
      makeCandidate({
        rank: 1,
        title: "N. Korean premier's China trip signals push to revive economic ties",
      }),
    ]);
    const article = makeArticle({
      rankInEdition: 1,
      eventSummary: "Lee pledges full support to keep megaprojects on corporate timetables",
    });
    expect(matchSelectionCandidate(article, report)).toBeNull();
  });

  it("returns null when no candidates exist at all", () => {
    expect(matchSelectionCandidate(makeArticle({}), makeReport([]))).toBeNull();
  });

  it("picks the higher-similarity candidate when multiple share the same rank", () => {
    const report = makeReport([
      makeCandidate({ id: "low", title: "Apple event announcement" }),
      makeCandidate({ id: "high", title: "Apple sues OpenAI over alleged trade secret theft" }),
    ]);
    const match = matchSelectionCandidate(makeArticle({}), report);
    expect(match?.candidate.id).toBe("high");
  });
});
