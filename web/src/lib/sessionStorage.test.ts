/**
 * Storage-layer behaviour of lib/session.ts — what happens when the one
 * localStorage key holding every saved word, bookmark and read article is
 * corrupted, full, or written by a newer build, and how a user gets their
 * record off the device. The session API itself is covered in session.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStorageIssue,
  exportSessionJson,
  getStorageIssue,
  importSessionJson,
  localSessionStore,
  sessionExportFilename,
  subscribeStorageIssue,
  type SessionExport,
} from "@/lib/session";

const STORAGE_KEY = "briefly:session:v1";

beforeEach(() => {
  window.localStorage.clear();
  clearStorageIssue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("corrupted values are repaired, not crashed on", () => {
  it("a null list reads as empty instead of throwing on .includes", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookmarks: null }));
    expect(localSessionStore.getBookmarks()).toEqual([]);
    expect(() => localSessionStore.isBookmarked("article-1")).not.toThrow();
    expect(localSessionStore.isBookmarked("article-1")).toBe(false);
  });

  it("a list of the wrong type falls back to empty and reports the field", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ readArticles: "article-1" }));
    expect(localSessionStore.getReadArticles()).toEqual([]);
    const issue = getStorageIssue();
    expect(issue?.kind).toBe("data-repaired");
    expect(issue?.detail).toContain("readArticles");
  });

  it("keeps the usable entries of a partly-corrupt list", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bookmarks: ["article-1", 7, null, "article-2"] })
    );
    expect(localSessionStore.getBookmarks()).toEqual(["article-1", "article-2"]);
    expect(getStorageIssue()?.detail).toContain("bookmarks");
  });

  it("drops saved words/sentences that are missing required fields", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedWords: [{ term: "workforce", meaning_ko: null }, { meaning_ko: "없음" }, "nope"],
        savedSentences: [
          {
            articleId: "article-1",
            level: "A2",
            sentenceIndex: 0,
            text: "Kept.",
            savedAt: "2026-07-13T00:00:00.000Z",
          },
          { articleId: "article-1", level: "Z9", sentenceIndex: 0, text: "x", savedAt: "x" },
        ],
      })
    );
    expect(localSessionStore.getSavedWords()).toEqual([
      { term: "workforce", meaning_ko: null },
    ]);
    expect(localSessionStore.getSavedSentences()).toHaveLength(1);
  });

  it("resets an out-of-range level/theme to the default", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ level: "C2", theme: 42, onboarded: "yes" })
    );
    expect(localSessionStore.getLevel()).toBe("A2");
    expect(localSessionStore.getTheme()).toBe("system");
    expect(localSessionStore.hasOnboarded()).toBe(false);
    expect(getStorageIssue()?.detail).toEqual(
      expect.arrayContaining(["level", "theme", "onboarded"])
    );
  });

  it("treats a missing field as a migration, not a corruption", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ level: "B1" }));
    expect(localSessionStore.getLevel()).toBe("B1");
    expect(localSessionStore.getReadEvents()).toEqual([]);
    expect(getStorageIssue()).toBeNull();
  });

  it("reports unreadable JSON rather than silently starting over", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(localSessionStore.getLevel()).toBe("A2");
    expect(getStorageIssue()?.kind).toBe("data-repaired");
  });
});

describe("a failed write is surfaced, not swallowed", () => {
  function breakWrites(error: Error) {
    return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw error;
    });
  }

  it("records a save-failed issue when the quota is exhausted", () => {
    const quota = new Error("exceeded the quota");
    quota.name = "QuotaExceededError";
    breakWrites(quota);

    localSessionStore.toggleBookmark("article-1");

    const issue = getStorageIssue();
    expect(issue?.kind).toBe("save-failed");
    expect(issue?.detail).toContain("저장 공간이 가득 찼습니다");
  });

  it("notifies subscribers so the UI can say the save did not stick", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStorageIssue(listener);
    breakWrites(new Error("localStorage is disabled"));

    localSessionStore.markRead("article-1");

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("clears the save-failed issue once a write succeeds again", () => {
    const spy = breakWrites(new Error("nope"));
    localSessionStore.toggleBookmark("article-1");
    expect(getStorageIssue()?.kind).toBe("save-failed");

    spy.mockRestore();
    localSessionStore.toggleBookmark("article-2");
    expect(getStorageIssue()).toBeNull();
  });
});

describe("schema version", () => {
  it("stamps the current version on what it writes", () => {
    localSessionStore.setLevel("B1");
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) as string);
    expect(raw.schemaVersion).toBe(1);
  });

  it("reads a newer blob best-effort but refuses to overwrite it", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 99, level: "B2", bookmarks: ["article-1"] })
    );
    expect(localSessionStore.getLevel()).toBe("B2");
    expect(getStorageIssue()?.kind).toBe("newer-schema");

    localSessionStore.toggleBookmark("article-2");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) as string);
    expect(stored.schemaVersion).toBe(99);
    expect(stored.bookmarks).toEqual(["article-1"]);
  });
});

describe("export / import", () => {
  it("exports the whole record inside a versioned envelope", () => {
    localSessionStore.setLevel("B2");
    localSessionStore.toggleBookmark("article-1");
    localSessionStore.toggleSavedWord({ term: "workforce", meaning_ko: "노동력" });

    const parsed = JSON.parse(exportSessionJson()) as SessionExport;
    expect(parsed.app).toBe("briefly");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.data.level).toBe("B2");
    expect(parsed.data.bookmarks).toEqual(["article-1"]);
    expect(parsed.data.savedWords[0].term).toBe("workforce");
  });

  it("names the backup file by date", () => {
    expect(sessionExportFilename(new Date("2026-08-11T09:00:00.000Z"))).toBe(
      "briefly-backup-2026-08-11.json"
    );
  });

  it("round-trips: export, wipe the device, import, everything is back", () => {
    localSessionStore.setLevel("B1");
    localSessionStore.setDisplayName("Yuko");
    localSessionStore.markRead("article-1");
    localSessionStore.toggleSavedSentence({
      articleId: "article-1",
      level: "B1",
      sentenceIndex: 2,
      text: "Saved sentence.",
      savedAt: "2026-07-13T00:00:00.000Z",
    });
    const backup = exportSessionJson();

    window.localStorage.clear();
    expect(localSessionStore.getLevel()).toBe("A2");

    expect(importSessionJson(backup)).toEqual({ ok: true });
    expect(localSessionStore.getLevel()).toBe("B1");
    expect(localSessionStore.getDisplayName()).toBe("Yuko");
    expect(localSessionStore.getReadArticles()).toEqual(["article-1"]);
    expect(localSessionStore.isSentenceSaved("article-1", "B1", 2)).toBe(true);
  });

  it("replaces the current record instead of merging two histories", () => {
    localSessionStore.toggleBookmark("from-backup");
    const backup = exportSessionJson();

    localSessionStore.toggleBookmark("added-later");
    expect(localSessionStore.getBookmarks()).toHaveLength(2);

    importSessionJson(backup);
    expect(localSessionStore.getBookmarks()).toEqual(["from-backup"]);
  });

  it("accepts a bare state blob recovered by hand", () => {
    const result = importSessionJson(JSON.stringify({ level: "B2", bookmarks: ["article-9"] }));
    expect(result.ok).toBe(true);
    expect(localSessionStore.getLevel()).toBe("B2");
    expect(localSessionStore.getBookmarks()).toEqual(["article-9"]);
  });

  it("reports which fields a damaged backup lost instead of failing outright", () => {
    const result = importSessionJson(
      JSON.stringify({ app: "briefly", schemaVersion: 1, data: { level: "B1", bookmarks: 5 } })
    );
    expect(result.ok).toBe(true);
    expect(result.repairs).toContain("bookmarks");
    expect(localSessionStore.getLevel()).toBe("B1");
  });

  it("rejects a file that isn't JSON, or isn't a session at all", () => {
    expect(importSessionJson("not json").ok).toBe(false);
    expect(importSessionJson('"just a string"').ok).toBe(false);
    // The stored record is untouched by a rejected import.
    localSessionStore.setLevel("B2");
    importSessionJson("not json");
    expect(localSessionStore.getLevel()).toBe("B2");
  });

  it("rejects a backup from a newer build rather than downgrading it", () => {
    const result = importSessionJson(
      JSON.stringify({ app: "briefly", schemaVersion: 99, data: { level: "B1" } })
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/v99/);
    expect(localSessionStore.getLevel()).toBe("A2");
  });

  it("says so when the restored record could not be written", () => {
    const backup = exportSessionJson();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("nope");
    });
    const result = importSessionJson(backup);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
