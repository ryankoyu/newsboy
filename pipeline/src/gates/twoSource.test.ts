import { describe, expect, it } from "vitest";
import { checkTwoSourceRule } from "./twoSource.js";
import type { ExtractedFact } from "../types.js";
import type { OutletIdentitySource } from "../config/outlets.js";

/**
 * Seven unrelated newsrooms — the plain case, where a name is an outlet and
 * counting names happened to give the right answer. The interesting fixtures
 * are the two below it, where it does not.
 */
const OUTLETS: OutletIdentitySource[] = ["A", "B", "C", "D", "E", "F", "G"].map((letter) => ({
  outlet: `Outlet ${letter}`,
  outletKey: `outlet-${letter.toLowerCase()}`,
}));

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
    const result = checkTwoSourceRule(healthyFacts(), OUTLETS);
    expect(result.passed).toBe(true);
    expect(result.violatingFacts).toEqual([]);
  });

  it("fails when a load-bearing fact has only one confirming outlet", () => {
    const facts = [
      ...healthyFacts(),
      fact({ statement: "Single-source fact", confirmedByOutlets: ["Outlet A"], usedInText: true }),
    ];
    const result = checkTwoSourceRule(facts, OUTLETS);
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
    const result = checkTwoSourceRule(facts, OUTLETS);
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
    const result = checkTwoSourceRule(facts, OUTLETS);
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
    const result = checkTwoSourceRule(facts, OUTLETS);
    expect(result.passed).toBe(false);
    expect(result.detail.loadBearingFacts).toBe(0);
    expect(result.detail.insufficientLoadBearing).toBe(true);
  });

  it("fails when there are 1-2 load-bearing facts (below MIN_LOAD_BEARING_FACTS) even though none individually violate the 2-source rule", () => {
    const facts = [
      fact({ statement: "A", confirmedByOutlets: ["Outlet A", "Outlet B"] }),
      fact({ statement: "B", confirmedByOutlets: ["Outlet C", "Outlet D"] }),
    ];
    const result = checkTwoSourceRule(facts, OUTLETS);
    expect(result.violatingFacts).toEqual([]); // no individual fact is under-sourced
    expect(result.passed).toBe(false); // but there aren't enough of them
    expect(result.detail.insufficientLoadBearing).toBe(true);
  });

  it("passes at exactly the MIN_LOAD_BEARING_FACTS boundary (3 well-sourced facts)", () => {
    const result = checkTwoSourceRule(healthyFacts(), OUTLETS);
    expect(result.detail.loadBearingFacts).toBe(3);
    expect(result.passed).toBe(true);
  });

  // --- 2026-08-16 inflated source count: what published on 2026-08-12 ---

  it("does not accept an aggregator as the second source", () => {
    // The Zhu Rongji and missile stories, both published 2026-08-12: one
    // newsroom, plus a Google News link pointing at that same reporting.
    // Counting names, that was two sources and the gate passed.
    const items: OutletIdentitySource[] = [
      { outlet: "Nikkei Asia", outletKey: "nikkei" },
      { outlet: "Google News (Economy)", outletKey: "google-news" },
    ];
    const facts = [
      fact({ statement: "A", confirmedByOutlets: ["Nikkei Asia", "Google News (Economy)"] }),
      fact({ statement: "B", confirmedByOutlets: ["Nikkei Asia", "Google News (Economy)"] }),
      fact({ statement: "C", confirmedByOutlets: ["Nikkei Asia", "Google News (Economy)"] }),
    ];
    const result = checkTwoSourceRule(facts, items);
    expect(result.passed).toBe(false);
    expect(result.violatingFacts).toEqual(["A", "B", "C"]);
  });

  it("does not accept one outlet's two feeds as two sources", () => {
    const items: OutletIdentitySource[] = [
      { outlet: "Korea Herald (Sports)", outletKey: "koreaherald" },
      { outlet: "Korea Herald (Life & Culture)", outletKey: "koreaherald" },
    ];
    const facts = [
      ...healthyFacts(),
      fact({
        statement: "One newsroom, two feeds",
        confirmedByOutlets: ["Korea Herald (Sports)", "Korea Herald (Life & Culture)"],
      }),
    ];
    const result = checkTwoSourceRule(facts, [...OUTLETS, ...items]);
    expect(result.passed).toBe(false);
    expect(result.violatingFacts).toEqual(["One newsroom, two feeds"]);
  });

  it("still passes a story two real newsrooms reported, aggregator link and all", () => {
    const items: OutletIdentitySource[] = [
      { outlet: "Nikkei Asia", outletKey: "nikkei" },
      { outlet: "Yonhap English", outletKey: "yonhap" },
      { outlet: "Google News (Economy)", outletKey: "google-news" },
    ];
    const confirmedByOutlets = ["Nikkei Asia", "Yonhap English", "Google News (Economy)"];
    const facts = [
      fact({ statement: "A", confirmedByOutlets }),
      fact({ statement: "B", confirmedByOutlets }),
      fact({ statement: "C", confirmedByOutlets }),
    ];
    expect(checkTwoSourceRule(facts, items).passed).toBe(true);
  });
});
