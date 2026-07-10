import { describe, expect, it } from "vitest";
import { checkNgramOverlap } from "./ngram.js";
import type { RawItem } from "../types.js";

function rawItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    outlet: "Test Outlet",
    url: "https://example.com/a",
    title: "Company announces new product",
    summary: "The company said today it will launch a new product next year.",
    publishedAt: "2026-07-10T00:00:00.000Z",
    category: "business",
    guid: "guid-1",
    ...overrides,
  };
}

describe("checkNgramOverlap", () => {
  it("flags text that copies a long run of source prose verbatim", () => {
    const sources = [
      rawItem({
        title: "Company layoffs",
        summary:
          "The struggling technology firm announced today that it will reduce its workforce significantly over the coming months as part of a wider restructuring plan.",
      }),
    ];
    // Rewritten text copies the exact same long run of non-proper-noun words.
    const rewritten =
      "The struggling technology firm announced today that it will reduce its workforce significantly over the coming months as part of a wider restructuring plan. This is separate additional commentary that was not in the source at all, added only to pad out the word count here.";

    const result = checkNgramOverlap(rewritten, sources);
    expect(result.passed).toBe(false);
    expect(result.flaggedNgrams.length).toBeGreaterThan(0);
  });

  it("passes text that is a genuine independent rewrite with low overlap", () => {
    const sources = [
      rawItem({
        title: "Company layoffs",
        summary:
          "The struggling technology firm announced today that it will reduce its workforce significantly over the coming months.",
      }),
    ];
    const rewritten =
      "A big tech company said it is cutting many jobs. Workers are worried about their future. Experts think other companies might do the same thing soon. People are watching the news closely to learn more about what will happen next.";

    const result = checkNgramOverlap(rewritten, sources);
    expect(result.passed).toBe(true);
    expect(result.overlapRatio).toBeLessThanOrEqual(0.08);
  });

  it("exempts shared proper-noun/number n-grams from flagging (unavoidable facts)", () => {
    const sources = [
      rawItem({
        title: "Meta layoffs",
        summary: "Meta Platforms Inc California United States confirmed 8000 2026 layoffs today.",
      }),
    ];
    // Rewritten text shares only the proper-noun/number run, wrapped in
    // completely original sentences around it.
    const rewritten =
      "Meta Platforms Inc California United States said many workers will lose their jobs this year. The decision affects several teams across the company and follows months of financial pressure in the wider technology sector overall.";

    const result = checkNgramOverlap(rewritten, sources);
    // The shared n-grams are all-caps-token / number sequences, so they
    // should be exempted rather than flagged.
    expect(result.flaggedNgrams).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
