import { describe, expect, it } from "vitest";
import { checkTwoSourceRule } from "./twoSource.js";
import type { ExtractedFact } from "../types.js";

function fact(overrides: Partial<ExtractedFact> = {}): ExtractedFact {
  return {
    statement: "Something happened.",
    confirmedByOutlets: ["Outlet A", "Outlet B"],
    sourceCount: 2,
    usedInText: true,
    searchSummaryOnly: false,
    ...overrides,
  };
}

/** 3 well-corroborated load-bearing facts — clears both the per-fact 2-source bar and the 3-fact minimum. */
function healthyFacts(): ExtractedFact[] {
  return [
    fact({ statement: "A", confirmedByOutlets: ["Outlet A", "Outlet B"] }),
    fact({ statement: "B", confirmedByOutlets: ["Outlet C", "Outlet D", "Outlet E"] }),
    fact({ statement: "C", confirmedByOutlets: ["Outlet F", "Outlet G"] }),
  ];
}

describe("checkTwoSourceRule", () => {
  it("passes when every load-bearing fact has 2+ distinct outlets and there are enough of them", () => {
    const result = checkTwoSourceRule(healthyFacts());
    expect(result.passed).toBe(true);
    expect(result.violatingFacts).toEqual([]);
  });

  it("fails when a load-bearing fact has only one confirming outlet", () => {
    const facts = [
      ...healthyFacts(),
      fact({ statement: "Single-source fact", confirmedByOutlets: ["Outlet A"], usedInText: true }),
    ];
    const result = checkTwoSourceRule(facts);
    expect(result.passed).toBe(false);
    expect(result.violatingFacts).toEqual(["Single-source fact"]);
  });

  it("ignores facts not used in text, even if single-sourced, as long as enough OTHER facts are load-bearing", () => {
    const facts = [
      ...healthyFacts(),
      fact({
        statement: "Not used",
        confirmedByOutlets: ["Outlet A"],
        usedInText: false,
      }),
    ];
    const result = checkTwoSourceRule(facts);
    expect(result.passed).toBe(true);
  });

  it("deduplicates outlet names when counting (same outlet listed twice is still 1 source)", () => {
    const facts = [
      ...healthyFacts(),
      fact({
        statement: "Duplicated outlet",
        confirmedByOutlets: ["Outlet A", "Outlet A"],
        usedInText: true,
      }),
    ];
    const result = checkTwoSourceRule(facts);
    expect(result.passed).toBe(false);
    expect(result.violatingFacts).toEqual(["Duplicated outlet"]);
  });

  // --- 2026-07-14 two-source bypass fix: MIN_LOAD_BEARING_FACTS coverage ---

  it("FAILS (not vacuously passes) when there are zero load-bearing facts — the original incident's exact shape", () => {
    // Reproduces the Texas-economy rank-7 incident: 3 facts extracted, all
    // single-sourced, so ALL were correctly marked usedInText=false at
    // extraction. Before the fix, checkTwoSourceRule saw 0 load-bearing
    // facts -> 0 violations -> passed=true. This must now fail outright.
    const facts = [
      fact({ statement: "Single 1", confirmedByOutlets: ["Outlet A"], usedInText: false }),
      fact({ statement: "Single 2", confirmedByOutlets: ["Outlet B"], usedInText: false }),
      fact({ statement: "Single 3", confirmedByOutlets: ["Outlet C"], usedInText: false }),
    ];
    const result = checkTwoSourceRule(facts);
    expect(result.passed).toBe(false);
    expect(result.detail.loadBearingFacts).toBe(0);
    expect(result.detail.insufficientLoadBearing).toBe(true);
  });

  it("fails when there are 1-2 load-bearing facts (below MIN_LOAD_BEARING_FACTS) even though none individually violate the 2-source rule", () => {
    const facts = [
      fact({ statement: "A", confirmedByOutlets: ["Outlet A", "Outlet B"] }),
      fact({ statement: "B", confirmedByOutlets: ["Outlet C", "Outlet D"] }),
    ];
    const result = checkTwoSourceRule(facts);
    expect(result.violatingFacts).toEqual([]); // no individual fact is under-sourced
    expect(result.passed).toBe(false); // but there aren't enough of them
    expect(result.detail.insufficientLoadBearing).toBe(true);
  });

  it("passes at exactly the MIN_LOAD_BEARING_FACTS boundary (3 well-sourced facts)", () => {
    const result = checkTwoSourceRule(healthyFacts());
    expect(result.detail.loadBearingFacts).toBe(3);
    expect(result.passed).toBe(true);
  });
});
