/**
 * [5c] 사전 뜻 생성 — every word in the body, not just the curated five.
 *
 * The reader can tap any word in an article (design-decisions.md §4.8-1), but
 * until now only the 5 words per level that the rewrite call curated had a
 * meaning; a B2 article is 450-520 words, so the other ~495 opened a card
 * saying "뜻 준비 중" — and, worse, promising a lookup that would arrive
 * later. Nothing was ever going to arrive: no code filled those in.
 *
 * This stage fills them in at publication time. It runs after the versions are
 * written and gated, collects every distinct word the reader can actually tap,
 * and asks Haiku for a Korean meaning and part of speech.
 *
 * Three decisions worth keeping:
 *
 * 1. **Surface forms, not lemmas.** "companies" is glossed as itself rather
 *    than reduced to "company". The reader taps what is on the page, so an
 *    exact-match lookup can never miss; lemmatizing would reintroduce the
 *    inflection-matching problem that web/src/lib/wordMatcher.ts already
 *    describes as unsolvable without real NLP. It costs more entries and no
 *    correctness.
 *
 * 2. **Glosses are global, keyed by term** — not scoped to an article the way
 *    curated `words` rows are. English is Zipfian: the first edition pays for
 *    ~1,700 words and each later one only for what it introduces, so the daily
 *    cost falls to near nothing while coverage keeps growing. That is also why
 *    known terms are passed in and skipped rather than regenerated.
 *
 * 3. **Never on the critical path.** A failed chunk is logged and skipped; the
 *    edition publishes with fewer glosses. A dictionary is an enhancement, and
 *    an enhancement must not be able to cost readers their news.
 *
 * What this stage does NOT do: proper nouns. Glossing "Nikkei" or "Yonhap"
 * means asserting something about the world, which is the pipeline's one
 * standing prohibition (CLAUDE.md rule 1) — a wrong gloss for a company or a
 * person is a fabricated fact wearing dictionary clothes. The prompt tells the
 * model to return nothing for them, and those words keep the honest empty
 * card.
 */

import type { CallUsage } from "../llm/cost.js";
import type { GlossEntry, PipelineArticle } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";

/**
 * How many terms go in one call.
 *
 * Bounded by output tokens, not input: a gloss is ~25 tokens, so 120 terms is
 * ~3k out — comfortably inside the 4096 ceiling complete() sets, with room for
 * the model to be more verbose than expected on a bad day.
 */
export const GLOSS_CHUNK_SIZE = 120;

/**
 * Nothing is skipped for being a common word.
 *
 * There used to be a stoplist here — "the", "of", "with", "than" and about
 * fifty others — on the theory that a Korean gloss for a preposition is noise
 * in a card meant to teach vocabulary. That theory was written from the point
 * of view of someone who already knows English. A reader at A2 who taps "with"
 * wants to know what it means, and the function words are exactly the ones a
 * beginner is least sure of.
 *
 * It also produced a hole the card could not explain. The empty card says the
 * word is a name we will not invent a meaning for, which is true of "Nikkei"
 * and plainly false of "with" — a screen telling the reader something untrue,
 * which is the one thing this codebase keeps having to fix.
 *
 * The cost of not skipping them is nil: there are only a few dozen such words
 * as distinct types, they are bought once, and every later edition gets them
 * free. One filter remains, in isGlossable below.
 */

/** Matches the tokenizer the reader's screen uses (web/src/lib/wordMatcher.ts WORD_RE). */
const WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

/** Same normalization as the web lookup: curly apostrophes folded, lowercased. */
export function glossKey(raw: string): string {
  return raw.replace(/[‘’ʼ]/g, "'").trim().toLowerCase();
}

function isGlossable(term: string): boolean {
  // A token containing a digit is a figure, a year, or an identifier — none of
  // which a dictionary entry helps with. That is the whole filter: everything
  // else a reader can tap, a reader can ask about, including "a" and "I".
  return !/[0-9]/.test(term);
}

/**
 * Every distinct word a reader could tap in this edition, in a stable order.
 *
 * Curated words are deliberately NOT excluded. A term curated at A2 is often
 * uncurated at B1 and B2, and glosses are keyed globally — excluding it here
 * would leave a hole on the two levels that never curated it. The reader's
 * screen prefers the curated entry where one exists, so the overlap costs a
 * handful of entries and closes a gap that would otherwise be invisible.
 */
export function collectGlossTerms(articles: readonly PipelineArticle[]): string[] {
  return collectTermsFromBodies(articles.flatMap((a) => a.versions.map((g) => g.version.content)));
}

/**
 * The same collection, from bodies alone.
 *
 * The backfill script (scripts/run-glossary.ts) reads an edition back out of
 * storage, where the articles do not carry their versions — the Supabase
 * adapter's getEdition() returns articles without nested content, and says so.
 * Taking body strings instead of assembled articles lets that path use exactly
 * this tokenizer and these filters rather than growing a second copy that
 * could drift from what the pipeline stores.
 */
export function collectTermsFromBodies(bodies: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const body of bodies) {
    for (const match of body.matchAll(WORD_RE)) {
      const term = glossKey(match[0]);
      if (isGlossable(term)) terms.add(term);
    }
  }
  // Sorted so the same edition produces the same call inputs twice running —
  // a resumed or re-run edition then hits the prompt cache instead of paying
  // for a reshuffled word list.
  return [...terms].sort();
}

/**
 * Whether this run's glosses may be written to the dictionary.
 *
 * Mock output is stored everywhere else in this pipeline — a mock run writes
 * "[mock]" articles to the edition and an operator is trusted not to publish
 * them. Glosses cannot follow that rule, because they differ from every other
 * artifact in three ways at once: they are global rather than edition-scoped,
 * nothing ever reviews them, and a stored term suppresses its own regeneration
 * forever (that suppression is the whole cost model). One `LLM_PROVIDER=mock`
 * run against a real store would therefore write ~1,700 fake Korean meanings
 * that no desk sees, that real runs then skip, and that readers eventually
 * tap — a failure with no natural end.
 *
 * So a mock run does everything except the write. The expensive-to-get-wrong
 * part — which words an edition contains, chunking, the known-set filter — is
 * still exercised end to end.
 */
export function mayPersistGlosses(llm: Pick<LLMProvider, "name">): boolean {
  return llm.name !== "mock";
}

export interface GlossaryResult {
  entries: GlossEntry[];
  /** Terms found in the edition, before the known-set filter. */
  found: number;
  /** Terms skipped because a previous edition already glossed them. */
  alreadyKnown: number;
  /** Chunks whose call failed — those terms simply have no gloss this run. */
  failedChunks: number;
  usage: CallUsage;
}

export async function buildGlossary(options: {
  terms: readonly string[];
  /** Terms the store already has. Normalized with glossKey by the caller. */
  known: ReadonlySet<string>;
  llm: LLMProvider;
  chunkSize?: number;
  log?: (message: string) => void;
}): Promise<GlossaryResult> {
  const { terms, known, llm, chunkSize = GLOSS_CHUNK_SIZE, log = () => {} } = options;
  const usage: CallUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
  const result: GlossaryResult = {
    entries: [],
    found: terms.length,
    alreadyKnown: 0,
    failedChunks: 0,
    usage,
  };

  if (!llm.generateGlosses) {
    log("[glossary] provider does not implement generateGlosses — no glosses this run");
    return result;
  }

  const pending = terms.filter((t) => !known.has(t));
  result.alreadyKnown = terms.length - pending.length;
  if (pending.length === 0) return result;

  const seen = new Set<string>();
  for (let i = 0; i < pending.length; i += chunkSize) {
    const chunk = pending.slice(i, i + chunkSize);
    const requested = new Set(chunk);
    try {
      const { entries, usage: chunkUsage } = await llm.generateGlosses({ terms: chunk });
      if (chunkUsage) {
        usage.inputTokens += chunkUsage.inputTokens;
        usage.outputTokens += chunkUsage.outputTokens;
        usage.cacheCreationInputTokens += chunkUsage.cacheCreationInputTokens;
        usage.cacheReadInputTokens += chunkUsage.cacheReadInputTokens;
      }
      for (const entry of entries) {
        const term = glossKey(entry.term ?? "");
        // A term the chunk did not ask about is the model volunteering a word
        // — drop it. Storing an unrequested entry means storing something no
        // reader can trace back to a page they were on.
        if (!requested.has(term) || seen.has(term)) continue;
        const meaning = entry.meaningKo?.trim();
        // No meaning is a valid answer, not a failure: it is what the prompt
        // asks for on proper nouns. Storing an empty gloss would replace the
        // honest "뜻 준비 중" card with a blank one.
        if (!meaning) continue;
        seen.add(term);
        result.entries.push({ term, meaningKo: meaning, pos: entry.pos?.trim() || undefined });
      }
    } catch (err) {
      result.failedChunks++;
      log(`[glossary] chunk ${i / chunkSize + 1} failed (${String(err)}) — ${chunk.length} term(s) left unglossed`);
    }
  }

  return result;
}
