/**
 * [6e] 분량 게이트 — docs/feature-status.md G6 ("B2 분량이 전 기사에서 목표에
 * 미달한다"). Real API production (07-14 edition) shipped B2 versions at
 * 334–447 words against a documented target of ~520 — every single one
 * under-length, and the existing CEFR heuristic (gates/cefr.ts
 * WORD_COUNT_BANDS: B2 400–560) was loose enough to let most of them pass.
 *
 * This gate checks against the tighter, level-specific TARGET word counts
 * from docs/project-brief.md §5 (A2 ~150–180 / B1 ~300–320 / B2 ~520), with a
 * symmetric ±10% tolerance band so a version isn't bounced for landing a
 * handful of words outside the target. It is independent of (and stricter
 * than) the CEFR heuristic's own looser word-count band — both run in
 * gate.ts, and either one failing triggers the rewrite loop.
 *
 * Word count is recomputed from `content` directly (naive whitespace split,
 * consistent with how LLM providers self-report `wordCount` — see
 * llm/mock.ts) rather than trusting the model's self-reported `wordCount`
 * field, since a gate that trusts self-reported numbers can't catch a model
 * that mis-reports.
 */

import type { CefrLevel } from "../types.js";

export interface WordCountTarget {
  min: number;
  max: number;
}

/**
 * Level-specific target word count (docs/project-brief.md §5, pre-tolerance).
 *
 * B1's floor is 300, not 280: this table carried 280 while citing the brief,
 * and the model wrote to whatever number it was given — 5 of the 10 B1
 * versions in the current web seed landed at 281–297, under the documented
 * floor but inside the mis-set band, so nothing flagged them.
 */
export const WORD_COUNT_TARGETS: Record<CefrLevel, WordCountTarget> = {
  A2: { min: 150, max: 180 },
  B1: { min: 300, max: 320 },
  B2: { min: 450, max: 520 },
};

/** Symmetric tolerance applied to each bound of the target range. */
export const WORD_COUNT_TOLERANCE_RATIO = 0.1; // ±10%

export function wordCountPassRange(level: CefrLevel): WordCountTarget {
  const target = WORD_COUNT_TARGETS[level];
  return {
    min: Math.round(target.min * (1 - WORD_COUNT_TOLERANCE_RATIO)),
    max: Math.round(target.max * (1 + WORD_COUNT_TOLERANCE_RATIO)),
  };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface WordCountCheckResult {
  passed: boolean;
  wordCount: number;
  target: WordCountTarget;
  passRange: WordCountTarget;
  detail: Record<string, unknown>;
  /** Feedback line for the rewrite prompt when this check fails. */
  feedback: string | null;
}

export function checkWordCount(content: string, level: CefrLevel): WordCountCheckResult {
  const wordCount = countWords(content);
  const target = WORD_COUNT_TARGETS[level];
  const passRange = wordCountPassRange(level);
  const passed = wordCount >= passRange.min && wordCount <= passRange.max;

  const feedback = passed
    ? null
    : `현재 ${wordCount}단어, 목표 ${target.min}~${target.max}단어 (허용 범위 ${passRange.min}~${passRange.max}단어)`;

  return {
    passed,
    wordCount,
    target,
    passRange,
    detail: { wordCount, target, passRange, feedback },
    feedback,
  };
}
