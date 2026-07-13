import { describe, it, expect } from "vitest";
import { computeWeeklyBrief, computeStreakDays, startOfWeek, dayKey } from "@/lib/weeklyBrief";
import type { ReadEvent, SavedSentenceEntry, SavedWordEntry } from "@/lib/session";

// Fixed "now" — Monday 2026-07-13 10:00 local time, so week math is
// deterministic across CI time zones. (2026-07-13 is a Monday.)
const NOW = new Date(2026, 6, 13, 10, 0, 0);

describe("startOfWeek", () => {
  it("returns the same Monday when now IS a Monday", () => {
    const start = startOfWeek(NOW);
    expect(dayKey(start)).toBe("2026-07-13");
  });

  it("returns the preceding Monday for a mid-week date", () => {
    const wednesday = new Date(2026, 6, 15, 9, 0, 0);
    expect(dayKey(startOfWeek(wednesday))).toBe("2026-07-13");
  });

  it("returns the preceding Monday for a Sunday (end of week)", () => {
    const sunday = new Date(2026, 6, 19, 23, 0, 0);
    expect(dayKey(startOfWeek(sunday))).toBe("2026-07-13");
  });
});

describe("computeStreakDays", () => {
  it("returns 0 when there are no read events", () => {
    expect(computeStreakDays([], NOW)).toBe(0);
  });

  it("returns 0 when today has no read event, even if yesterday does", () => {
    const events: ReadEvent[] = [
      { articleId: "a1", readAt: new Date(2026, 6, 12, 9, 0, 0).toISOString() },
    ];
    expect(computeStreakDays(events, NOW)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const events: ReadEvent[] = [
      { articleId: "a1", readAt: new Date(2026, 6, 13, 8, 0, 0).toISOString() }, // today
      { articleId: "a2", readAt: new Date(2026, 6, 12, 8, 0, 0).toISOString() }, // yesterday
      { articleId: "a3", readAt: new Date(2026, 6, 11, 8, 0, 0).toISOString() }, // 2 days ago
    ];
    expect(computeStreakDays(events, NOW)).toBe(3);
  });

  it("stops counting at the first gap", () => {
    const events: ReadEvent[] = [
      { articleId: "a1", readAt: new Date(2026, 6, 13, 8, 0, 0).toISOString() }, // today
      { articleId: "a2", readAt: new Date(2026, 6, 12, 8, 0, 0).toISOString() }, // yesterday
      // gap on 2026-07-11
      { articleId: "a3", readAt: new Date(2026, 6, 10, 8, 0, 0).toISOString() },
    ];
    expect(computeStreakDays(events, NOW)).toBe(2);
  });

  it("multiple reads on the same day count as one streak day", () => {
    const events: ReadEvent[] = [
      { articleId: "a1", readAt: new Date(2026, 6, 13, 8, 0, 0).toISOString() },
      { articleId: "a2", readAt: new Date(2026, 6, 13, 9, 0, 0).toISOString() },
      { articleId: "a3", readAt: new Date(2026, 6, 13, 20, 0, 0).toISOString() },
    ];
    expect(computeStreakDays(events, NOW)).toBe(1);
  });

  it("ignores events with an unparsable timestamp", () => {
    const events: ReadEvent[] = [
      { articleId: "a1", readAt: "not-a-date" },
    ];
    expect(computeStreakDays(events, NOW)).toBe(0);
  });
});

describe("computeWeeklyBrief", () => {
  it("counts distinct articles read within the current Mon-Sun week only", () => {
    const readEvents: ReadEvent[] = [
      { articleId: "a1", readAt: new Date(2026, 6, 13, 6, 0, 0).toISOString() }, // this week (Mon, before NOW)
      { articleId: "a2", readAt: new Date(2026, 6, 13, 9, 0, 0).toISOString() }, // this week (Mon, before NOW)
      { articleId: "a1", readAt: new Date(2026, 6, 13, 9, 30, 0).toISOString() }, // dup article, still this week
      { articleId: "a3", readAt: new Date(2026, 6, 6, 8, 0, 0).toISOString() }, // last week — excluded
    ];
    const stats = computeWeeklyBrief(
      { readEvents, savedWords: [], savedSentences: [] },
      NOW
    );
    expect(stats.articlesRead).toBe(2);
  });

  it("counts words saved this week and excludes words with no savedAt (pre-migration data)", () => {
    const savedWords: SavedWordEntry[] = [
      { term: "standard", meaning_ko: "표준", savedAt: new Date(2026, 6, 13, 8, 0, 0).toISOString() },
      { term: "deal", meaning_ko: "거래", savedAt: new Date(2026, 6, 6, 8, 0, 0).toISOString() }, // last week
      { term: "legacy-word", meaning_ko: null }, // no savedAt — pre-migration, excluded
    ];
    const stats = computeWeeklyBrief(
      { readEvents: [], savedWords, savedSentences: [] },
      NOW
    );
    expect(stats.wordsSaved).toBe(1);
  });

  it("counts sentences saved this week", () => {
    const savedSentences: SavedSentenceEntry[] = [
      {
        articleId: "a1",
        level: "A2",
        sentenceIndex: 0,
        text: "Sample.",
        savedAt: new Date(2026, 6, 13, 8, 0, 0).toISOString(),
      },
      {
        articleId: "a2",
        level: "A2",
        sentenceIndex: 1,
        text: "Older.",
        savedAt: new Date(2026, 6, 1, 8, 0, 0).toISOString(),
      },
    ];
    const stats = computeWeeklyBrief(
      { readEvents: [], savedWords: [], savedSentences },
      NOW
    );
    expect(stats.sentencesSaved).toBe(1);
  });

  it("includes streakDays computed from readEvents", () => {
    const readEvents: ReadEvent[] = [
      { articleId: "a1", readAt: new Date(2026, 6, 13, 8, 0, 0).toISOString() },
      { articleId: "a2", readAt: new Date(2026, 6, 12, 8, 0, 0).toISOString() },
    ];
    const stats = computeWeeklyBrief(
      { readEvents, savedWords: [], savedSentences: [] },
      NOW
    );
    expect(stats.streakDays).toBe(2);
  });

  it("returns all zeros for empty input", () => {
    const stats = computeWeeklyBrief(
      { readEvents: [], savedWords: [], savedSentences: [] },
      NOW
    );
    expect(stats).toEqual({
      articlesRead: 0,
      wordsSaved: 0,
      sentencesSaved: 0,
      streakDays: 0,
    });
  });
});
