import { lookupKey, tokenizeSentence } from "@/lib/wordMatcher";

/**
 * The words in a body that are worth asking the dictionary about.
 *
 * Deliberately the same tokenizer the reader's screen uses
 * (wordMatcher.tokenizeSentence) rather than a second one: a term this misses
 * is a word the reader can still tap and will find nothing for, and a term it
 * invents is a lookup that can never hit. One tokenizer, one answer.
 *
 * The filters mirror pipeline/src/pipeline/glossary.ts — three letters or
 * more, no digits. Function words are NOT filtered here even though the
 * pipeline skips them: this side only decides what to *ask* about, and a term
 * that was never stored simply comes back absent. Duplicating the stopword
 * list across two packages would give it two chances to drift, and the cost
 * of asking is one entry in an `in (...)` clause.
 */
export function collectBodyTerms(bodies: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const body of bodies) {
    for (const token of tokenizeSentence(body)) {
      if (!token.isWord) continue;
      const term = lookupKey(token.text);
      if (term.length < 3 || /[0-9]/.test(term)) continue;
      terms.add(term);
    }
  }
  return [...terms];
}
