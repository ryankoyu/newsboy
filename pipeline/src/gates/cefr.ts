/**
 * [6a] CEFR 난이도 근사 검사기 — a1-architecture.md §2 [6a],
 * news-sourcing-strategy.md §4-1 ("B2가 C1로 드리프트 실측 — 어휘·문장 난이도
 * 자동 검사").
 *
 * ============================== LIMITATIONS ==============================
 * This is a HEURISTIC, not a real CEFR classifier:
 *  - No external readability/CEFR API is used (task constraint: build without
 *    one; a1 §3.1 assumes an LLM boundary-check as backstop, provided here
 *    via LLMProvider.judgeCefrBand).
 *  - The word-frequency band (gates/data/wordbands.ts) is a small hand-curated
 *    list, not a licensed frequency corpus (e.g. not English Vocabulary
 *    Profile). It only reliably catches gross violations — an A2 text full of
 *    academic/advanced vocabulary, or a text far outside its target word-count
 *    band. It will miss subtle drift (e.g. B2 text using upper-B2/C1 idioms
 *    that aren't in the small marker list) — this is the exact drift R3
 *    observed and flagged as a known risk.
 *  - Sentence-length is used as a proxy for syntactic complexity, which is
 *    itself an approximation (a short sentence can still be conceptually hard).
 *
 * Given these limits, results near the pass/fail boundary should defer to
 * LLMProvider.judgeCefrBand (a1 §2 [6a]: "애매하면 LLM 판정"), and a human
 * reviewer has the final say at stage [7]. Do not present this checker's
 * score as an authoritative CEFR rating.
 * ===========================================================================
 */

import type { CefrLevel } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { CallUsage } from "../llm/cost.js";
import { A2_CORE_WORDS, ADVANCED_MARKER_WORDS } from "./data/wordbands.js";

export interface CefrHeuristicResult {
  score: number; // 0-100, higher = more advanced-looking (not a calibrated CEFR number)
  passed: boolean;
  wordCount: number;
  avgSentenceLength: number;
  advancedWordHits: string[];
  basicWordRatio: number;
  ambiguous: boolean;
  detail: Record<string, unknown>;
}

const WORD_COUNT_BANDS: Record<CefrLevel, { min: number; max: number }> = {
  A2: { min: 130, max: 210 },
  B1: { min: 250, max: 360 },
  B2: { min: 400, max: 560 },
};

/** Rough sentence-length ceilings per level — proxy for syntactic complexity. */
const AVG_SENTENCE_LENGTH_CEILING: Record<CefrLevel, number> = {
  A2: 14,
  B1: 20,
  B2: 28,
};

/** Minimum share of tokens that should be "clearly basic" per level (loosens as level rises). */
const MIN_BASIC_WORD_RATIO: Record<CefrLevel, number> = {
  A2: 0.55,
  B1: 0.4,
  B2: 0.25,
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function checkCefrHeuristic(text: string, level: CefrLevel): CefrHeuristicResult {
  const words = tokenize(text);
  const wordCount = words.length;
  const sentences = splitSentences(text);
  const avgSentenceLength = sentences.length > 0 ? wordCount / sentences.length : wordCount;

  const basicHits = words.filter((w) => A2_CORE_WORDS.has(w)).length;
  const basicWordRatio = wordCount > 0 ? basicHits / wordCount : 0;

  const lowerText = text.toLowerCase();
  const advancedWordHits = [...ADVANCED_MARKER_WORDS].filter((w) => lowerText.includes(w));

  const band = WORD_COUNT_BANDS[level];
  const withinWordCountBand = wordCount >= band.min && wordCount <= band.max;
  const withinSentenceLength = avgSentenceLength <= AVG_SENTENCE_LENGTH_CEILING[level];
  const meetsBasicRatio = basicWordRatio >= MIN_BASIC_WORD_RATIO[level];
  const noAdvancedMarkers = advancedWordHits.length === 0;

  // Score: 0 = clearly on-target, 100 = clearly over target. Purely heuristic scaling, not calibrated.
  const overageFromWordCount = wordCount > band.max ? (wordCount - band.max) / band.max : 0;
  const overageFromSentence =
    avgSentenceLength > AVG_SENTENCE_LENGTH_CEILING[level]
      ? (avgSentenceLength - AVG_SENTENCE_LENGTH_CEILING[level]) / AVG_SENTENCE_LENGTH_CEILING[level]
      : 0;
  const overageFromVocab = advancedWordHits.length * 0.15 + Math.max(0, MIN_BASIC_WORD_RATIO[level] - basicWordRatio);
  const score = Math.min(100, Math.round((overageFromWordCount + overageFromSentence + overageFromVocab) * 100));

  const passed =
    withinWordCountBand && withinSentenceLength && meetsBasicRatio && noAdvancedMarkers;

  // "Ambiguous" = close to the boundary on any single dimension -> defer to LLM per a1 §2[6a].
  const ambiguous =
    !passed &&
    Math.abs(wordCount - band.max) / band.max < 0.1 &&
    advancedWordHits.length === 0 &&
    basicWordRatio >= MIN_BASIC_WORD_RATIO[level] - 0.05;

  return {
    score,
    passed,
    wordCount,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    advancedWordHits,
    basicWordRatio: Math.round(basicWordRatio * 1000) / 1000,
    ambiguous,
    detail: {
      band,
      withinWordCountBand,
      withinSentenceLength,
      meetsBasicRatio,
      noAdvancedMarkers,
      sentenceLengthCeiling: AVG_SENTENCE_LENGTH_CEILING[level],
      minBasicWordRatio: MIN_BASIC_WORD_RATIO[level],
    },
  };
}

/**
 * Full CEFR check: heuristic first, LLM judgment only if the heuristic is
 * ambiguous (a1 §2[6a] design; keeps LLM calls off the hot path when the
 * heuristic is decisive).
 */
export async function checkCefr(
  text: string,
  level: CefrLevel,
  llm: LLMProvider,
  /**
   * Reports the Haiku boundary-judgment call usage, when one is made. The
   * heuristic resolves most texts without any API call, so this fires only
   * for the ambiguous ones.
   */
  onUsage?: (usage: CallUsage | undefined) => void,
): Promise<{ passed: boolean; score: number; detail: Record<string, unknown> }> {
  const heuristic = checkCefrHeuristic(text, level);
  if (!heuristic.ambiguous) {
    return { passed: heuristic.passed, score: heuristic.score, detail: { heuristic, llmUsed: false } };
  }

  const judgment = await llm.judgeCefrBand({ text, targetLevel: level });
  onUsage?.(judgment.usage);
  return {
    passed: judgment.withinBand,
    score: heuristic.score,
    detail: { heuristic, llmUsed: true, llmReasoning: judgment.reasoning },
  };
}
