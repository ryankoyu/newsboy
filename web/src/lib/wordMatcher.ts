import type { Word } from "@/lib/types";

/**
 * Pure word-matching logic extracted from ArticleBody.tsx (Q2 fix) so it can
 * be unit tested without rendering React. Behavior is unchanged from the
 * original inline implementation — see ArticleBody.tsx's file-level comment
 * for the design rationale:
 * - Multi-word terms ("lay off") match a contiguous token sequence, and the
 *   ENTIRE sequence becomes one clickable span (not just the first word).
 * - Curly apostrophes (') are normalized to straight ('), and vice versa.
 * - Matching is case-insensitive.
 * - A conservative inflection check covers plural -s/-es, past -ed, and
 *   progressive -ing (plus simple consonant-doubling / -e-drop spelling
 *   variants: stun/stunned, hope/hoping). Irregular forms are intentionally
 *   NOT covered — aggressive stemming risks false matches.
 */

// Split a sentence into tokens, keeping punctuation/whitespace as separate
// non-clickable tokens. A "word" token = letters, digits, apostrophes,
// hyphens (so "well-known" and "Zuckerberg's" stay one token).
const WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

export function tokenizeSentence(sentence: string): Array<{ text: string; isWord: boolean }> {
  const tokens: Array<{ text: string; isWord: boolean }> = [];
  let lastIndex = 0;
  for (const match of sentence.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push({ text: sentence.slice(lastIndex, start), isWord: false });
    }
    tokens.push({ text: match[0], isWord: true });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < sentence.length) {
    tokens.push({ text: sentence.slice(lastIndex), isWord: false });
  }
  return tokens;
}

// Normalize curly quotes/apostrophes to straight ones and lowercase, so
// "Zuckerberg's" (curly ') and "Zuckerberg's" (straight ') compare equal.
export function normalizeApostrophes(raw: string): string {
  return raw.replace(/[‘’ʼ]/g, "'");
}

export function lookupKey(raw: string): string {
  return normalizeApostrophes(raw).toLowerCase();
}

// Strip a parenthetical POS/usage hint from a curated term, e.g.
// "upset (n.)" -> "upset".
export function stripParenthetical(term: string): string {
  return term.replace(/\s*\(.*?\)\s*/g, "").trim();
}

/**
 * Conservative inflected forms of a single base word: plural -s/-es, past
 * -ed, progressive -ing, including the common spelling adjustments
 * (drop final -e before a vowel suffix; double a short final consonant).
 * Deliberately does NOT touch irregular verbs/nouns.
 */
export function conservativeInflections(base: string): Set<string> {
  const forms = new Set<string>([base]);
  if (base.length < 2) return forms;

  const lastChar = base[base.length - 1];
  const secondLast = base[base.length - 2];
  const endsInConsonant = !"aeiou".includes(lastChar);
  const isVowel = (c: string) => "aeiou".includes(c);

  // Plural / 3rd-person -s / -es.
  if (/[sxz]$/.test(base) || /(ch|sh)$/.test(base)) {
    forms.add(base + "es");
  } else if (base.endsWith("y") && !isVowel(secondLast ?? "")) {
    forms.add(base.slice(0, -1) + "ies");
  } else {
    forms.add(base + "s");
  }

  // Past tense -ed / progressive -ing.
  if (base.endsWith("e")) {
    forms.add(base + "d"); // hope -> hoped
    forms.add(base.slice(0, -1) + "ing"); // hope -> hoping
  } else if (
    base.endsWith("y") &&
    !isVowel(secondLast ?? "") &&
    base.length > 1
  ) {
    forms.add(base.slice(0, -1) + "ied"); // study -> studied
    forms.add(base + "ing"); // study -> studying
  } else {
    forms.add(base + "ed");
    forms.add(base + "ing");
    // Short vowel + single final consonant -> double it (stun -> stunned).
    if (
      endsInConsonant &&
      base.length >= 3 &&
      isVowel(secondLast ?? "") &&
      !isVowel(base[base.length - 3] ?? "x") &&
      !"wxy".includes(lastChar)
    ) {
      forms.add(base + lastChar + "ed");
      forms.add(base + lastChar + "ing");
    }
  }

  return forms;
}

export interface WordSequence {
  /** Normalized, lowercase tokens of the curated term, e.g. ["lay", "off"]. */
  tokens: string[];
  entry: Word;
}

/** Precompute normalized multi-token sequences for every curated word. */
export function buildWordSequences(words: Word[]): WordSequence[] {
  return words.map((w) => ({
    tokens: lookupKey(stripParenthetical(w.term)).split(/\s+/).filter(Boolean),
    entry: w,
  }));
}

/** Does body token `bodyTok` match sequence token `seqTok` (exact or a conservative inflection)? */
export function tokenMatches(bodyTok: string, seqTok: string): boolean {
  if (bodyTok === seqTok) return true;
  return conservativeInflections(seqTok).has(bodyTok);
}

// A run of one or more consecutive word-tokens (from tokenizeSentence) that
// matches one curated Word entry — the whole run becomes one clickable span.
export interface MatchedRun {
  startIdx: number; // index into the token array (inclusive)
  endIdx: number; // index into the token array (inclusive)
  entry: Word;
}

/**
 * Greedily scan a sentence's tokens and find runs that match a curated
 * word's sequence. Longer (multi-word) sequences are tried first at each
 * position so "lay off" wins over a hypothetical single-word "lay" entry.
 * Whitespace/punctuation tokens between two matched word-tokens are allowed
 * inside a multi-word run (e.g. "lay   off" or "lay-off").
 */
export function findMatchedRuns(
  tokens: Array<{ text: string; isWord: boolean }>,
  sequences: WordSequence[],
): MatchedRun[] {
  const runs: MatchedRun[] = [];
  const wordTokenIdxs = tokens
    .map((t, i) => (t.isWord ? i : -1))
    .filter((i) => i >= 0);

  const sortedSequences = [...sequences].sort((a, b) => b.tokens.length - a.tokens.length);

  let cursor = 0; // index into wordTokenIdxs
  while (cursor < wordTokenIdxs.length) {
    let matched: MatchedRun | null = null;

    for (const seq of sortedSequences) {
      if (seq.tokens.length === 0) continue;
      if (cursor + seq.tokens.length > wordTokenIdxs.length) continue;

      let ok = true;
      for (let k = 0; k < seq.tokens.length; k++) {
        const bodyIdx = wordTokenIdxs[cursor + k];
        const bodyTok = lookupKey(tokens[bodyIdx].text);
        if (!tokenMatches(bodyTok, seq.tokens[k])) {
          ok = false;
          break;
        }
      }

      if (ok) {
        const startIdx = wordTokenIdxs[cursor];
        const endIdx = wordTokenIdxs[cursor + seq.tokens.length - 1];
        matched = { startIdx, endIdx, entry: seq.entry };
        cursor += seq.tokens.length;
        break;
      }
    }

    if (matched) {
      runs.push(matched);
    } else {
      cursor += 1;
    }
  }

  return runs;
}
