import { describe, expect, it } from "vitest";
import { checkWordMatch, termAppearsInBody } from "./wordMatch.js";
import type { WordEntry } from "../types.js";

function word(term: string, overrides: Partial<WordEntry> = {}): WordEntry {
  return {
    term,
    meaningKo: "뜻",
    example: "example",
    pronunciation: "ipa",
    sortOrder: 0,
    ...overrides,
  };
}

describe("termAppearsInBody", () => {
  it("matches a multi-word term as a contiguous sequence", () => {
    expect(termAppearsInBody("lay off", "The company will lay off many workers next month.")).toBe(
      true,
    );
  });

  it("does not match a multi-word term whose words appear non-contiguously", () => {
    expect(
      termAppearsInBody("lay off", "The company will lay everyone off eventually, they said."),
    ).toBe(false);
  });

  it("matches across curly vs straight apostrophes", () => {
    expect(termAppearsInBody("don't", "The workers said they don’t agree with the plan.")).toBe(
      true,
    );
    expect(termAppearsInBody("don’t", "The workers said they don't agree with the plan.")).toBe(
      true,
    );
  });

  it("matches conservative plural inflection", () => {
    expect(termAppearsInBody("worker", "Many workers lost their jobs today.")).toBe(true);
  });

  it("matches conservative past-tense inflection with -e drop", () => {
    expect(termAppearsInBody("announce", "The firm announced a new plan yesterday.")).toBe(true);
  });

  it("matches conservative progressive -ing inflection", () => {
    expect(termAppearsInBody("plan", "They are planning a new strategy for next year.")).toBe(true);
  });

  it("does not match irregular inflected forms (documented limitation)", () => {
    // "lay" -> "laid" is irregular and NOT covered by conservativeInflections.
    expect(termAppearsInBody("lay", "The company laid off many workers yesterday.")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(termAppearsInBody("Company", "the company announced layoffs today across regions.")).toBe(
      true,
    );
  });
});

describe("checkWordMatch", () => {
  it("passes when every curated word appears in the body", () => {
    const content = "The company will lay off many workers. Analysts are watching closely.";
    const words = [word("lay off"), word("worker"), word("analyst")];
    const result = checkWordMatch(content, words);
    expect(result.passed).toBe(true);
    expect(result.unmatchedTerms).toEqual([]);
  });

  it("fails and reports unmatched terms when a curated word is missing from the body", () => {
    const content = "The company announced a new plan today.";
    const words = [word("plan"), word("layoff")];
    const result = checkWordMatch(content, words);
    expect(result.passed).toBe(false);
    expect(result.unmatchedTerms).toEqual(["layoff"]);
  });
});
