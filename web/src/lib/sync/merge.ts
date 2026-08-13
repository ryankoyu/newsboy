import type { SavedWordEntry, SavedSentenceEntry, ReadEvent } from "@/lib/session";
import type { CefrLevel } from "@/lib/types";

/**
 * Merging a device's data with the server's.
 *
 * One rule decides everything here: **a merge may never lose something the
 * reader saved.** Sync exists so that changing phones does not cost them
 * their vocabulary; a sync that resolves a conflict by deleting is worse
 * than no sync at all, because it destroys data silently and at a moment
 * the reader has no reason to be watching.
 *
 * So every collection is a union, never a replacement, and "delete" is not
 * a thing this module can express. Removing a saved word is a separate,
 * explicit action — not something a merge infers from absence. A word
 * missing on one side means that device has not seen it yet, which is the
 * normal state of a device that was offline, not an instruction.
 *
 * Pure functions with no client, no I/O, no clock: this is the part where a
 * mistake is expensive and invisible, so it is the part that is testable.
 */

/** Union by term, keeping whichever copy was saved first and any meaning found. */
export function mergeSavedWords(
  local: SavedWordEntry[],
  remote: SavedWordEntry[]
): SavedWordEntry[] {
  const byTerm = new Map<string, SavedWordEntry>();

  for (const entry of [...remote, ...local]) {
    const existing = byTerm.get(entry.term);
    if (!existing) {
      byTerm.set(entry.term, entry);
      continue;
    }
    byTerm.set(entry.term, {
      term: entry.term,
      // A known meaning beats an unknown one whichever side it came from.
      // null is "not looked up yet" (design-decisions §4.8-1), never a fact
      // about the word, so it loses to any real value.
      meaning_ko: existing.meaning_ko ?? entry.meaning_ko,
      // Earliest wins: the reader saved it then, and "saved 3 weeks ago" is
      // what the weekly brief counts on.
      savedAt: earliest(existing.savedAt, entry.savedAt),
    });
  }

  return [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term));
}

function earliest(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** Union by (articleId, level, sentenceIndex) — a sentence saved on either device stays. */
export function mergeSavedSentences(
  local: SavedSentenceEntry[],
  remote: SavedSentenceEntry[]
): SavedSentenceEntry[] {
  const byKey = new Map<string, SavedSentenceEntry>();
  const key = (s: SavedSentenceEntry) => `${s.articleId}:${s.level}:${s.sentenceIndex}`;

  for (const entry of [...remote, ...local]) {
    const existing = byKey.get(key(entry));
    if (!existing || entry.savedAt < existing.savedAt) byKey.set(key(entry), entry);
  }
  return [...byKey.values()].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

/** Plain set union — read and bookmarked are one-way facts. */
export function mergeIds(local: string[], remote: string[]): string[] {
  return [...new Set([...local, ...remote])];
}

/** Union by articleId, keeping the earliest timestamp for each. */
export function mergeReadEvents(local: ReadEvent[], remote: ReadEvent[]): ReadEvent[] {
  const byArticle = new Map<string, ReadEvent>();
  for (const event of [...remote, ...local]) {
    const existing = byArticle.get(event.articleId);
    if (!existing || event.readAt < existing.readAt) byArticle.set(event.articleId, event);
  }
  return [...byArticle.values()].sort((a, b) => a.readAt.localeCompare(b.readAt));
}

/**
 * Which reading level to keep.
 *
 * Unlike the collections, this is a single value and one side has to lose,
 * so the tie-break is chosen to avoid the outcome a reader would actually
 * notice: opening the app on their phone and finding the text has changed
 * difficulty because a laptop they used once disagreed.
 *
 * A device that has been through onboarding has a level its reader chose on
 * purpose, and it wins. A device that has not is running on the A2 default,
 * which nobody picked — there, the server's answer is better than a default.
 */
export function resolveLevel(
  local: { level: CefrLevel; onboarded: boolean },
  remoteLevel: CefrLevel | null
): CefrLevel {
  if (!remoteLevel) return local.level;
  return local.onboarded ? local.level : remoteLevel;
}

/**
 * Whether an id can be stored in a column that references articles(id).
 *
 * Local ids are only real UUIDs when the reader is served from Supabase.
 * On the committed seed they look like `article-2026-07-13-4`, and pushing
 * one would fail the foreign key — so those rows are skipped rather than
 * sent, and the caller reports how many. Saved WORDS have no such problem:
 * their word_id is nullable and the term is snapshotted, so a reader's
 * vocabulary syncs either way.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStorableArticleId(id: string): boolean {
  return UUID.test(id);
}

export function partitionStorable(ids: string[]): { storable: string[]; skipped: string[] } {
  const storable: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) (isStorableArticleId(id) ? storable : skipped).push(id);
  return { storable, skipped };
}
