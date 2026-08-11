import { describe, expect, it } from "vitest";
import { checkCefrHeuristic } from "./cefr.js";

/** Repeats a short basic sentence to hit an exact word-count target for band-boundary tests. */
function repeatToWordCount(sentence: string, targetWords: number): string {
  const words = sentence.trim().split(/\s+/);
  const out: string[] = [];
  while (out.length < targetWords) {
    out.push(...words);
  }
  return out.slice(0, targetWords).join(" ") + ".";
}

describe("checkCefrHeuristic", () => {
  it("passes an A2 text within word-count band, short sentences, mostly basic words", () => {
    const text = repeatToWordCount(
      "The man got a new job. He is happy now. His family is happy too",
      160,
    );
    const result = checkCefrHeuristic(text, "A2");
    expect(result.passed).toBe(true);
  });

  it("fails an A2 text that is far too long for the A2 band (word-count overage)", () => {
    const text = repeatToWordCount(
      "The man got a new job. He is happy now. His family is happy too",
      300, // A2 band max is 210
    );
    const result = checkCefrHeuristic(text, "A2");
    expect(result.passed).toBe(false);
    expect(result.detail).toMatchObject({ withinWordCountBand: false });
  });

  it("fails a B2 text containing advanced marker vocabulary regardless of length", () => {
    const base = repeatToWordCount(
      "Analysts said the situation could change over the next several months as more information becomes available to the public",
      420,
    );
    const text = `${base} The outcome remains ubiquitous across every major market this year.`;
    const result = checkCefrHeuristic(text, "B2");
    expect(result.passed).toBe(false);
    expect(result.advancedWordHits).toContain("ubiquitous");
  });

  it("marks a near-boundary A2 text as ambiguous rather than a hard pass/fail", () => {
    // Word count band max for A2 is 210; put it just inside the 10% margin
    // used by the ambiguous heuristic (well within band but very close to it),
    // with no advanced markers and basic ratio near the threshold.
    const text = repeatToWordCount(
      "The man got a new job and he told his friend and his friend was happy",
      205,
    );
    const result = checkCefrHeuristic(text, "A2");
    // Whether it passes or not, the important boundary-case property is that
    // when it's this close to the ceiling with no advanced markers, the
    // heuristic should not confidently hard-fail without flagging ambiguity
    // for LLM boundary judgment (per gates/cefr.ts §6a design).
    if (!result.passed) {
      expect(result.ambiguous).toBe(true);
    }
  });
});

describe("word-count band: undershoot vs overshoot", () => {
  // Real case: 2026-07-14 rank 8 came back at 338 against a 400-560 B2 band
  // after three rewrites, every other CEFR dimension passing. Five facts do
  // not stretch to 400 words without repetition or invention.
  const wordsFor = (n: number) =>
    Array.from({ length: n }, (_, i) => (i % 9 === 8 ? "and." : "the")).join(" ");

  it("passes a modest undershoot and flags it for the desk", () => {
    const r = checkCefrHeuristic(wordsFor(338), "B2");
    expect(r.detail.withinWordCountBand).toBe(true);
    expect(r.detail.belowBand).toBe(true);
  });

  it("fails a text below the floor — short has a limit", () => {
    // 0.8 x 400 = 320, so 300 is under the floor.
    const r = checkCefrHeuristic(wordsFor(300), "B2");
    expect(r.detail.withinWordCountBand).toBe(false);
    expect(r.detail.belowBand).toBe(false);
  });

  it("still fails an overshoot — too long is a level violation, not thin material", () => {
    const r = checkCefrHeuristic(wordsFor(300), "A2");
    expect(r.detail.withinWordCountBand).toBe(false);
  });

  it("does not flag a text inside its band", () => {
    const r = checkCefrHeuristic(wordsFor(450), "B2");
    expect(r.detail.withinWordCountBand).toBe(true);
    expect(r.detail.belowBand).toBe(false);
  });
});
