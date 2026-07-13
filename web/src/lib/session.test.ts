import { describe, it, expect, beforeEach } from "vitest";
import { localSessionStore } from "@/lib/session";

const STORAGE_KEY = "briefly:session:v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("localSessionStore — defaults", () => {
  it("defaults level to A2 when nothing is stored", () => {
    expect(localSessionStore.getLevel()).toBe("A2");
  });

  it("defaults font size to M, theme to system", () => {
    expect(localSessionStore.getFontSize()).toBe("M");
    expect(localSessionStore.getTheme()).toBe("system");
  });

  it("defaults onboarding banner to not dismissed and onboarded to false", () => {
    expect(localSessionStore.hasOnboarded()).toBe(false);
    expect(localSessionStore.hasDismissedOnboardingBanner()).toBe(false);
  });

  it("defaults bookmarks/read/seen/saved to empty lists", () => {
    expect(localSessionStore.getBookmarks()).toEqual([]);
    expect(localSessionStore.getReadArticles()).toEqual([]);
    expect(localSessionStore.getSeenWords()).toEqual([]);
    expect(localSessionStore.getSavedWords()).toEqual([]);
  });
});

describe("localSessionStore — persistence via localStorage", () => {
  it("persists level across a fresh read", () => {
    localSessionStore.setLevel("B2");
    expect(localSessionStore.getLevel()).toBe("B2");
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).level).toBe("B2");
  });

  it("persists font size and theme", () => {
    localSessionStore.setFontSize("XL");
    localSessionStore.setTheme("dark");
    expect(localSessionStore.getFontSize()).toBe("XL");
    expect(localSessionStore.getTheme()).toBe("dark");
  });

  it("merges with defaults when localStorage has a partial/old shape", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: "B1" }));
    expect(localSessionStore.getLevel()).toBe("B1");
    // Fields absent from the stored blob fall back to defaults.
    expect(localSessionStore.getFontSize()).toBe("M");
    expect(localSessionStore.getBookmarks()).toEqual([]);
  });

  it("falls back to defaults when localStorage contains invalid JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(localSessionStore.getLevel()).toBe("A2");
  });
});

describe("localSessionStore — onboarding banner", () => {
  it("dismissOnboardingBanner persists true", () => {
    expect(localSessionStore.hasDismissedOnboardingBanner()).toBe(false);
    localSessionStore.dismissOnboardingBanner();
    expect(localSessionStore.hasDismissedOnboardingBanner()).toBe(true);
  });

  it("setOnboarded(true) persists across reads", () => {
    localSessionStore.setOnboarded(true);
    expect(localSessionStore.hasOnboarded()).toBe(true);
  });
});

describe("localSessionStore — bookmarks", () => {
  it("toggleBookmark adds then removes an article id, returning the new state", () => {
    expect(localSessionStore.isBookmarked("article-1")).toBe(false);

    const added = localSessionStore.toggleBookmark("article-1");
    expect(added).toBe(true);
    expect(localSessionStore.isBookmarked("article-1")).toBe(true);
    expect(localSessionStore.getBookmarks()).toEqual(["article-1"]);

    const removed = localSessionStore.toggleBookmark("article-1");
    expect(removed).toBe(false);
    expect(localSessionStore.isBookmarked("article-1")).toBe(false);
    expect(localSessionStore.getBookmarks()).toEqual([]);
  });

  it("supports multiple distinct bookmarks", () => {
    localSessionStore.toggleBookmark("a");
    localSessionStore.toggleBookmark("b");
    expect(localSessionStore.getBookmarks().sort()).toEqual(["a", "b"]);
  });
});

describe("localSessionStore — read articles", () => {
  it("markRead adds the article id and is idempotent", () => {
    expect(localSessionStore.isRead("article-1")).toBe(false);
    localSessionStore.markRead("article-1");
    expect(localSessionStore.isRead("article-1")).toBe(true);
    localSessionStore.markRead("article-1");
    expect(localSessionStore.getReadArticles()).toEqual(["article-1"]);
  });
});

describe("localSessionStore — seen words", () => {
  it("markWordSeen stores lowercase key and is case-insensitive on read", () => {
    localSessionStore.markWordSeen("Workforce");
    expect(localSessionStore.isWordSeen("workforce")).toBe(true);
    expect(localSessionStore.isWordSeen("WORKFORCE")).toBe(true);
    expect(localSessionStore.getSeenWords()).toEqual(["workforce"]);
  });

  it("does not duplicate an already-seen word", () => {
    localSessionStore.markWordSeen("lay off");
    localSessionStore.markWordSeen("Lay Off");
    expect(localSessionStore.getSeenWords()).toEqual(["lay off"]);
  });
});

describe("localSessionStore — saved words", () => {
  it("toggleSavedWord adds then removes an entry, returning the new state", () => {
    const entry = { term: "workforce", meaning_ko: "노동력" };
    expect(localSessionStore.isWordSaved("workforce")).toBe(false);

    const added = localSessionStore.toggleSavedWord(entry);
    expect(added).toBe(true);
    expect(localSessionStore.isWordSaved("workforce")).toBe(true);
    expect(localSessionStore.getSavedWords()).toEqual([entry]);

    const removed = localSessionStore.toggleSavedWord(entry);
    expect(removed).toBe(false);
    expect(localSessionStore.isWordSaved("workforce")).toBe(false);
    expect(localSessionStore.getSavedWords()).toEqual([]);
  });

  it("toggleSavedWord matches case-insensitively on term", () => {
    localSessionStore.toggleSavedWord({ term: "Workforce", meaning_ko: "노동력" });
    expect(localSessionStore.isWordSaved("workforce")).toBe(true);
    const removed = localSessionStore.toggleSavedWord({
      term: "WORKFORCE",
      meaning_ko: "노동력",
    });
    expect(removed).toBe(false);
    expect(localSessionStore.getSavedWords()).toEqual([]);
  });
});

describe("localSessionStore — saved sentences", () => {
  it("defaults to an empty list", () => {
    expect(localSessionStore.getSavedSentences()).toEqual([]);
  });

  it("toggleSavedSentence adds then removes an entry, returning the new state", () => {
    const entry = {
      articleId: "article-1",
      level: "A2" as const,
      sentenceIndex: 0,
      text: "Ro Khanna is a US congressman from California.",
      savedAt: "2026-07-13T00:00:00.000Z",
    };
    expect(localSessionStore.isSentenceSaved("article-1", "A2", 0)).toBe(false);

    const added = localSessionStore.toggleSavedSentence(entry);
    expect(added).toBe(true);
    expect(localSessionStore.isSentenceSaved("article-1", "A2", 0)).toBe(true);
    expect(localSessionStore.getSavedSentences()).toEqual([entry]);

    const removed = localSessionStore.toggleSavedSentence(entry);
    expect(removed).toBe(false);
    expect(localSessionStore.isSentenceSaved("article-1", "A2", 0)).toBe(false);
    expect(localSessionStore.getSavedSentences()).toEqual([]);
  });

  it("distinguishes entries by (articleId, level, sentenceIndex) — same article, different level", () => {
    localSessionStore.toggleSavedSentence({
      articleId: "article-1",
      level: "A2",
      sentenceIndex: 0,
      text: "A2 sentence.",
      savedAt: "2026-07-13T00:00:00.000Z",
    });
    localSessionStore.toggleSavedSentence({
      articleId: "article-1",
      level: "B1",
      sentenceIndex: 0,
      text: "B1 sentence.",
      savedAt: "2026-07-13T00:00:01.000Z",
    });

    expect(localSessionStore.isSentenceSaved("article-1", "A2", 0)).toBe(true);
    expect(localSessionStore.isSentenceSaved("article-1", "B1", 0)).toBe(true);
    expect(localSessionStore.getSavedSentences()).toHaveLength(2);

    // Removing the A2 entry should not affect the B1 entry.
    localSessionStore.toggleSavedSentence({
      articleId: "article-1",
      level: "A2",
      sentenceIndex: 0,
      text: "A2 sentence.",
      savedAt: "2026-07-13T00:00:00.000Z",
    });
    expect(localSessionStore.isSentenceSaved("article-1", "A2", 0)).toBe(false);
    expect(localSessionStore.isSentenceSaved("article-1", "B1", 0)).toBe(true);
  });

  it("distinguishes entries by sentenceIndex within the same article/level", () => {
    localSessionStore.toggleSavedSentence({
      articleId: "article-1",
      level: "A2",
      sentenceIndex: 0,
      text: "First.",
      savedAt: "2026-07-13T00:00:00.000Z",
    });
    localSessionStore.toggleSavedSentence({
      articleId: "article-1",
      level: "A2",
      sentenceIndex: 1,
      text: "Second.",
      savedAt: "2026-07-13T00:00:00.000Z",
    });
    expect(localSessionStore.getSavedSentences()).toHaveLength(2);
    expect(localSessionStore.isSentenceSaved("article-1", "A2", 0)).toBe(true);
    expect(localSessionStore.isSentenceSaved("article-1", "A2", 1)).toBe(true);
    expect(localSessionStore.isSentenceSaved("article-1", "A2", 2)).toBe(false);
  });

  it("persists saved sentences in localStorage across reads", () => {
    const entry = {
      articleId: "article-2",
      level: "B2" as const,
      sentenceIndex: 3,
      text: "Persisted sentence.",
      savedAt: "2026-07-13T00:00:00.000Z",
    };
    localSessionStore.toggleSavedSentence(entry);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).savedSentences).toEqual([entry]);
  });
});

describe("localSessionStore — display name", () => {
  it("setDisplayName persists and can be cleared with null", () => {
    localSessionStore.setDisplayName("Yuko");
    expect(localSessionStore.getDisplayName()).toBe("Yuko");
    localSessionStore.setDisplayName(null);
    expect(localSessionStore.getDisplayName()).toBeNull();
  });
});
