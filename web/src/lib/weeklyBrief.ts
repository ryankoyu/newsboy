/**
 * Weekly brief + streak aggregation — enhancement-plan.md Batch 1 #3.
 *
 * Pure functions over timestamped session data (ReadEvent / SavedWordEntry /
 * SavedSentenceEntry), so they're easy to unit test without touching
 * localStorage. Tone: light, no guilt (never surfaces "missed days" —
 * task constraint).
 *
 * Week definition: Monday–Sunday, in the user's local time zone (matches
 * "이번 주(월~일)" in the task spec).
 */

import type { ReadEvent, SavedSentenceEntry, SavedWordEntry } from "@/lib/session";

/** Start of the Monday–Sunday week containing `date`, at local midnight. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

/** Local calendar-day key, e.g. "2026-07-13" (avoids UTC-shift bugs vs toISOString). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWithinWeek(iso: string, weekStart: Date, now: Date): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return t >= weekStart.getTime() && t < weekEnd.getTime() && t <= now.getTime();
}

export interface WeeklyBriefStats {
  articlesRead: number;
  wordsSaved: number;
  sentencesSaved: number;
  streakDays: number;
}

/**
 * Aggregates this-week stats + current streak from timestamped local data.
 * Entries without a timestamp (pre-migration data) are excluded — never
 * backfilled (CLAUDE.md rule 1).
 */
export function computeWeeklyBrief(
  {
    readEvents,
    savedWords,
    savedSentences,
  }: {
    readEvents: ReadEvent[];
    savedWords: SavedWordEntry[];
    savedSentences: SavedSentenceEntry[];
  },
  now: Date = new Date()
): WeeklyBriefStats {
  const weekStart = startOfWeek(now);

  // Distinct articles read this week (an article read twice counts once).
  const articlesReadThisWeek = new Set(
    readEvents.filter((e) => isWithinWeek(e.readAt, weekStart, now)).map((e) => e.articleId)
  );

  const wordsSaved = savedWords.filter(
    (w) => w.savedAt && isWithinWeek(w.savedAt, weekStart, now)
  ).length;

  const sentencesSaved = savedSentences.filter((s) =>
    isWithinWeek(s.savedAt, weekStart, now)
  ).length;

  return {
    articlesRead: articlesReadThisWeek.size,
    wordsSaved,
    sentencesSaved,
    streakDays: computeStreakDays(readEvents, now),
  };
}

/**
 * Consecutive-day streak ending today: "그날 기사 1개 이상 읽음" per day,
 * counting backward from today. Breaks (returns the count so far) on the
 * first day with no read event. Timestamp-less events are ignored.
 */
export function computeStreakDays(readEvents: ReadEvent[], now: Date = new Date()): number {
  const readDays = new Set(
    readEvents
      .map((e) => new Date(e.readAt))
      .filter((d) => !Number.isNaN(d.getTime()))
      .map(dayKey)
  );

  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (readDays.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
