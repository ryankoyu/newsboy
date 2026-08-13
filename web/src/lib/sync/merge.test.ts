import { describe, it, expect } from "vitest";
import {
  mergeSavedWords,
  mergeSavedSentences,
  mergeIds,
  mergeReadEvents,
  resolveLevel,
  partitionStorable,
  isStorableArticleId,
} from "@/lib/sync/merge";
import type { SavedWordEntry, SavedSentenceEntry } from "@/lib/session";

const word = (term: string, meaning: string | null = null, savedAt?: string): SavedWordEntry => ({
  term,
  meaning_ko: meaning,
  savedAt,
});

describe("mergeSavedWords", () => {
  it("keeps words that exist on only one side", () => {
    const merged = mergeSavedWords([word("ferry")], [word("quake")]);
    expect(merged.map((w) => w.term)).toEqual(["ferry", "quake"]);
  });

  it("never drops a word because the other side has not seen it", () => {
    // The failure this whole module exists to prevent: a phone that was
    // offline for a week must not delete a week of vocabulary.
    const local = [word("a"), word("b"), word("c")];
    const merged = mergeSavedWords(local, []);
    expect(merged).toHaveLength(3);
  });

  it("prefers a real meaning over an unlooked-up one, from either side", () => {
    expect(mergeSavedWords([word("ferry")], [word("ferry", "여객선")])[0].meaning_ko).toBe(
      "여객선"
    );
    expect(mergeSavedWords([word("ferry", "여객선")], [word("ferry")])[0].meaning_ko).toBe(
      "여객선"
    );
  });

  it("keeps the earliest save time — the weekly brief counts on it", () => {
    const merged = mergeSavedWords(
      [word("ferry", null, "2026-08-12T00:00:00Z")],
      [word("ferry", null, "2026-08-01T00:00:00Z")]
    );
    expect(merged[0].savedAt).toBe("2026-08-01T00:00:00Z");
  });

  it("survives an entry that never had a timestamp", () => {
    const merged = mergeSavedWords([word("ferry")], [word("ferry", null, "2026-08-01T00:00:00Z")]);
    expect(merged[0].savedAt).toBe("2026-08-01T00:00:00Z");
  });

  it("is order-independent — merging either way round gives the same set", () => {
    const a = [word("x", "엑스", "2026-08-02T00:00:00Z"), word("y")];
    const b = [word("y", "와이", "2026-08-01T00:00:00Z"), word("z")];
    expect(mergeSavedWords(a, b)).toEqual(mergeSavedWords(b, a));
  });
});

describe("mergeSavedSentences", () => {
  const sentence = (idx: number, savedAt: string): SavedSentenceEntry => ({
    articleId: "a1",
    level: "A2",
    sentenceIndex: idx,
    text: `Sentence ${idx}.`,
    savedAt,
  });

  it("keeps sentences saved on either device", () => {
    const merged = mergeSavedSentences(
      [sentence(1, "2026-08-12T00:00:00Z")],
      [sentence(2, "2026-08-11T00:00:00Z")]
    );
    expect(merged.map((s) => s.sentenceIndex)).toEqual([2, 1]);
  });

  it("treats the same sentence at a different level as a different save", () => {
    const a2 = sentence(1, "2026-08-12T00:00:00Z");
    const b1: SavedSentenceEntry = { ...a2, level: "B1" };
    expect(mergeSavedSentences([a2], [b1])).toHaveLength(2);
  });

  it("does not duplicate the same sentence saved on both devices", () => {
    const s = sentence(1, "2026-08-12T00:00:00Z");
    expect(mergeSavedSentences([s], [{ ...s }])).toHaveLength(1);
  });
});

describe("mergeIds / mergeReadEvents", () => {
  it("unions ids without duplicating", () => {
    expect(mergeIds(["a", "b"], ["b", "c"]).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps the earliest read time for an article", () => {
    const merged = mergeReadEvents(
      [{ articleId: "a", readAt: "2026-08-12T00:00:00Z" }],
      [{ articleId: "a", readAt: "2026-08-01T00:00:00Z" }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].readAt).toBe("2026-08-01T00:00:00Z");
  });
});

describe("resolveLevel", () => {
  it("keeps the level this reader chose here", () => {
    // Opening the app and finding the difficulty changed, because a laptop
    // used once disagreed, is the outcome worth avoiding.
    expect(resolveLevel({ level: "B2", onboarded: true }, "A2")).toBe("B2");
  });

  it("takes the server's level when this device is still on the untouched default", () => {
    expect(resolveLevel({ level: "A2", onboarded: false }, "B1")).toBe("B1");
  });

  it("keeps the local level when the server has none", () => {
    expect(resolveLevel({ level: "B1", onboarded: false }, null)).toBe("B1");
  });
});

describe("partitionStorable", () => {
  it("accepts real article UUIDs", () => {
    expect(isStorableArticleId("d3c460da-931f-4a1f-b19f-b3ed9406bed9")).toBe(true);
  });

  it("rejects seed ids, which would fail the foreign key", () => {
    expect(isStorableArticleId("article-2026-07-13-4")).toBe(false);
  });

  it("splits a mixed list rather than failing the whole push", () => {
    const { storable, skipped } = partitionStorable([
      "d3c460da-931f-4a1f-b19f-b3ed9406bed9",
      "article-2026-07-13-4",
    ]);
    expect(storable).toHaveLength(1);
    expect(skipped).toEqual(["article-2026-07-13-4"]);
  });
});
