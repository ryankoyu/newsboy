/**
 * [6d] 단어-본문 일치 검사 — design-decisions.md §4.6 QA 후 정책 확정 (Q2 발견:
 * 시드에서 A2 본문 클릭 가능 단어 0건).
 *
 * Every curated word for a version must actually appear in that version's
 * body — otherwise the web word-click feature silently has nothing to
 * click. This mirrors the matching rules implemented in
 * web/src/components/ArticleBody.tsx so the gate and the UI agree on what
 * counts as "present":
 *  - multi-word terms ("lay off") match as a contiguous sequence
 *  - curly/straight apostrophes are normalized
 *  - case-insensitive
 *  - conservative inflections only: plural -s/-es, past -ed, progressive
 *    -ing (with -e drop / consonant doubling spelling variants). Irregular
 *    forms (lay -> laid) are NOT covered, matching the web-side rule.
 *
 * If a word fails to match, the version fails this gate and — like the
 * other gates in gate.ts — feeds back into the rewrite loop so the model
 * can pick words that are actually in its own text (or drop ones that
 * aren't), rather than silently shipping unclickable "curated" words.
 */

import type { WordEntry } from "../types.js";

export interface WordMatchCheckResult {
  passed: boolean;
  unmatchedTerms: string[];
  detail: Record<string, unknown>;
}

function normalizeApostrophes(raw: string): string {
  return raw.replace(/[‘’ʼ]/g, "'");
}

function lookupKey(raw: string): string {
  return normalizeApostrophes(raw).toLowerCase();
}

function stripParenthetical(term: string): string {
  return term.replace(/\s*\(.*?\)\s*/g, "").trim();
}

const WORD_RE = /[A-Za-z0-9]+(?:['‘’-][A-Za-z0-9]+)*/g;

function tokenizeBody(text: string): string[] {
  return (normalizeApostrophes(text).match(WORD_RE) ?? []).map((t) => t.toLowerCase());
}

/**
 * Conservative inflected forms of a single base word — identical rules to
 * the web-side conservativeInflections() in ArticleBody.tsx. Kept as a
 * separate implementation (no shared package between web/ and pipeline/),
 * but any change here should be mirrored there and vice versa.
 */
function conservativeInflections(base: string): Set<string> {
  const forms = new Set<string>([base]);
  if (base.length < 2) return forms;

  const lastChar = base[base.length - 1];
  const secondLast = base[base.length - 2];
  const endsInConsonant = !"aeiou".includes(lastChar);
  const isVowel = (c: string) => "aeiou".includes(c);

  if (/[sxz]$/.test(base) || /(ch|sh)$/.test(base)) {
    forms.add(base + "es");
  } else if (base.endsWith("y") && !isVowel(secondLast ?? "")) {
    forms.add(base.slice(0, -1) + "ies");
  } else {
    forms.add(base + "s");
  }

  if (base.endsWith("e")) {
    forms.add(base + "d");
    forms.add(base.slice(0, -1) + "ing");
  } else if (base.endsWith("y") && !isVowel(secondLast ?? "") && base.length > 1) {
    forms.add(base.slice(0, -1) + "ied");
    forms.add(base + "ing");
  } else {
    forms.add(base + "ed");
    forms.add(base + "ing");
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

function tokenMatches(bodyTok: string, seqTok: string): boolean {
  if (bodyTok === seqTok) return true;
  return conservativeInflections(seqTok).has(bodyTok);
}

/** Does `term` appear in `bodyText` as a contiguous token sequence (allowing conservative inflection on each token)? */
export function termAppearsInBody(term: string, bodyText: string): boolean {
  const seqTokens = lookupKey(stripParenthetical(term)).split(/\s+/).filter(Boolean);
  if (seqTokens.length === 0) return false;

  const bodyTokens = tokenizeBody(bodyText);

  for (let start = 0; start + seqTokens.length <= bodyTokens.length; start++) {
    let ok = true;
    for (let k = 0; k < seqTokens.length; k++) {
      if (!tokenMatches(bodyTokens[start + k], seqTokens[k])) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

export function checkWordMatch(content: string, words: WordEntry[]): WordMatchCheckResult {
  const unmatched = words.filter((w) => !termAppearsInBody(w.term, content));

  return {
    passed: unmatched.length === 0,
    unmatchedTerms: unmatched.map((w) => w.term),
    detail: {
      totalWords: words.length,
      unmatchedCount: unmatched.length,
    },
  };
}
