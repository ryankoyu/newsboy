import { lookupKey, tokenizeSentence } from "@/lib/wordMatcher";

/**
 * The words in a body that are worth asking the dictionary about.
 *
 * Deliberately the same tokenizer the reader's screen uses
 * (wordMatcher.tokenizeSentence) rather than a second one: a term this misses
 * is a word the reader can still tap and will find nothing for, and a term it
 * invents is a lookup that can never hit. One tokenizer, one answer.
 *
 * The filter mirrors pipeline/src/pipeline/glossary.ts: anything without a
 * digit. Both sides once skipped common words like "with" and short ones like
 * "of"; a reader at A2 taps exactly those, and the empty card they got claimed
 * the word was a proper noun. Now the only words without a meaning are the
 * ones the model declined, which is what the card actually says.
 */
export function collectBodyTerms(bodies: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const body of bodies) {
    for (const token of tokenizeSentence(body)) {
      if (!token.isWord) continue;
      const term = lookupKey(token.text);
      if (/[0-9]/.test(term)) continue;
      terms.add(term);
    }
  }
  return [...terms];
}
