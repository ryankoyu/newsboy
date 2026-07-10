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

describe("checkTwoSourceRule", () => {
  it("passes when every load-bearing fact has 2+ distinct outlets", () => {
    const facts = [
      fact({ statement: "A", confirmedByOutlets: ["Outlet A", "Outlet B"] }),
      fact({ statement: "B", confirmedByOutlets: ["Outlet C", "Outlet D", "Outlet E"] }),
    ];
    const result = checkTwoSourceRule(facts);
    expect(result.passed).toBe(true);
    expect(result.violatingFacts).toEqual([]);
  });

  it("fails when a load-bearing fact has only one confirming outlet", () => {
    const facts = [
      fact({ statement: "Single-source fact", confirmedByOutlets: ["Outlet A"], usedInText: true }),
    ];
    const result = checkTwoSourceRule(facts);
    expect(result.passed).toBe(false);
    expect(result.violatingFacts).toEqual(["Single-source fact"]);
  });

  it("ignores facts not used in text, even if single-sourced", () => {
    const facts = [
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
});
