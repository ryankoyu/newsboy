/**
 * [6c] 2소스 검증 재확인 — a1-architecture.md §2 [6c].
 *
 * Final check before publication: every fact still marked `usedInText` must
 * have 2+ distinct confirming outlets. This re-runs the same rule as
 * pipeline/extract.ts's enforceTwoSourceRule — deliberately redundant. A1
 * calls this out as a *separate* final gate (not just relying on stage [4]
 * having done it once), because facts could in principle be re-flagged
 * between extraction and publication in a future version of the pipeline.
 */

import type { ExtractedFact } from "../types.js";

const MIN_SOURCES = 2;

export interface TwoSourceCheckResult {
  passed: boolean;
  violatingFacts: string[];
  detail: Record<string, unknown>;
}

export function checkTwoSourceRule(facts: ExtractedFact[]): TwoSourceCheckResult {
  const loadBearing = facts.filter((f) => f.usedInText);
  const violating = loadBearing.filter((f) => new Set(f.confirmedByOutlets).size < MIN_SOURCES);

  return {
    passed: violating.length === 0,
    violatingFacts: violating.map((f) => f.statement),
    detail: {
      totalFacts: facts.length,
      loadBearingFacts: loadBearing.length,
      violatingCount: violating.length,
      minSourcesRequired: MIN_SOURCES,
    },
  };
}
