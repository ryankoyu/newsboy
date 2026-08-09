import { describe, it, expect } from "vitest";
import { checkWordCount, countWords, wordCountPassRange, WORD_COUNT_TARGETS } from "./wordCount.js";

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("ignores extra whitespace/newlines", () => {
    expect(countWords("one\n\n two   three\t four")).toBe(4);
  });

  it("returns 0 for empty content", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("wordCountPassRange", () => {
  it("widens each level's target by the ±10% tolerance", () => {
    expect(wordCountPassRange("A2")).toEqual({ min: 135, max: 198 });
    expect(wordCountPassRange("B1")).toEqual({ min: 252, max: 352 });
    expect(wordCountPassRange("B2")).toEqual({ min: 405, max: 572 });
  });
});

describe("checkWordCount — docs/feature-status.md G6 (B2 분량 미달)", () => {
  it("passes content within the target range", () => {
    const result = checkWordCount(words(WORD_COUNT_TARGETS.B2.min + 20), "B2");
    expect(result.passed).toBe(true);
    expect(result.feedback).toBeNull();
  });

  it("passes content within the ±10% tolerance but outside the raw target", () => {
    // 420 is below B2's raw target min (450) but within the 405 tolerance floor.
    const result = checkWordCount(words(420), "B2");
    expect(result.passed).toBe(true);
  });

  it("fails the real-world 07-14 B2 under-length case (334-447 words, all below the 405 floor except the top end)", () => {
    const shortB2 = checkWordCount(words(334), "B2");
    expect(shortB2.passed).toBe(false);
    expect(shortB2.feedback).toBe(
      "현재 334단어, 목표 450~520단어 (허용 범위 405~572단어)",
    );

    // 447 is still under the raw 450 target but clears the 405 tolerance floor.
    const closeB2 = checkWordCount(words(447), "B2");
    expect(closeB2.passed).toBe(true);
  });

  it("fails content far over the target range", () => {
    const result = checkWordCount(words(700), "B2");
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain("700단어");
  });

  it("applies the correct band per level (A2/B1)", () => {
    expect(checkWordCount(words(100), "A2").passed).toBe(false); // too short
    expect(checkWordCount(words(165), "A2").passed).toBe(true);
    expect(checkWordCount(words(200), "B1").passed).toBe(false); // too short
    expect(checkWordCount(words(300), "B1").passed).toBe(true);
  });
});
