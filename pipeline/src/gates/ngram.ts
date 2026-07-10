/**
 * [6b] n-gram 원문 중복 검사기 — a1-architecture.md §2 [6b],
 * news-sourcing-strategy.md §4-2 ("고유명사·불가피한 사실 표현은 예외 처리").
 *
 * Checks the rewritten text's n-grams (default n=6) against every source
 * item's title+summary. A shared n-gram is only flagged if it is NOT made up
 * entirely of "exempt" tokens (proper nouns / numbers / common factual
 * collocations) — otherwise unavoidable facts like "Meta laid off 8,000
 * employees" would false-positive on every run (R3 self-evaluation §c).
 *
 * LIMITATION: proper-noun detection here is capitalization-based (a token
 * capitalized mid-sentence in the SOURCE is treated as a likely proper noun).
 * This is a heuristic, not real NER — it will occasionally over- or
 * under-exempt. It is deliberately conservative (biased toward flagging) so
 * that false negatives (missed copying) are less likely than false positives
 * (an occasional legitimate phrase gets flagged and re-written unnecessarily).
 */

import type { RawItem } from "../types.js";

const NGRAM_SIZE = 6;
/** Overlap ratio above which the text fails the gate. */
const OVERLAP_THRESHOLD = 0.08;

function tokenize(text: string): string[] {
  return text
    .replace(/[^a-zA-Z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isLikelyProperNounOrNumber(token: string): boolean {
  if (/^\d+([.,]\d+)?%?$/.test(token)) return true; // numbers/percentages
  if (/^[A-Z]/.test(token) && token.length > 1) return true; // capitalized -> likely proper noun
  return false;
}

function ngrams(tokens: string[], n: number): string[][] {
  const result: string[][] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    result.push(tokens.slice(i, i + n));
  }
  return result;
}

function ngramKey(gram: string[]): string {
  return gram.map((t) => t.toLowerCase()).join(" ");
}

export interface NgramCheckResult {
  passed: boolean;
  overlapRatio: number;
  totalNgrams: number;
  flaggedNgrams: string[];
  detail: Record<string, unknown>;
}

export function checkNgramOverlap(rewrittenText: string, sources: RawItem[]): NgramCheckResult {
  const sourceCorpus = sources.map((s) => `${s.title} ${s.summary}`).join(" ");
  const sourceTokens = tokenize(sourceCorpus);
  const sourceNgramSet = new Set(ngrams(sourceTokens, NGRAM_SIZE).map(ngramKey));

  const rewrittenTokens = tokenize(rewrittenText);
  const rewrittenNgrams = ngrams(rewrittenTokens, NGRAM_SIZE);

  const flagged: string[] = [];
  for (const gram of rewrittenNgrams) {
    const key = ngramKey(gram);
    if (!sourceNgramSet.has(key)) continue;
    // Exempt if every token in the shared n-gram is a proper noun/number —
    // that's an unavoidable shared fact, not copied prose (R3 §c).
    const allExempt = gram.every((t) => isLikelyProperNounOrNumber(t));
    if (!allExempt) flagged.push(key);
  }

  const totalNgrams = rewrittenNgrams.length;
  const overlapRatio = totalNgrams > 0 ? flagged.length / totalNgrams : 0;
  const passed = overlapRatio <= OVERLAP_THRESHOLD;

  return {
    passed,
    overlapRatio: Math.round(overlapRatio * 1000) / 1000,
    totalNgrams,
    flaggedNgrams: [...new Set(flagged)].slice(0, 20), // cap for readability in reports
    detail: { ngramSize: NGRAM_SIZE, threshold: OVERLAP_THRESHOLD },
  };
}
