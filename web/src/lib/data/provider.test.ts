import { describe, it, expect } from "vitest";
import { dataProvider, estimateReadingMinutes } from "@/lib/data";

describe("estimateReadingMinutes", () => {
  it("uses 90wpm for A2", () => {
    // 180 words / 90 wpm = 2 min exactly.
    expect(estimateReadingMinutes("A2", 180)).toBe(2);
  });

  it("uses 120wpm for B1", () => {
    // 240 words / 120 wpm = 2 min exactly.
    expect(estimateReadingMinutes("B1", 240)).toBe(2);
  });

  it("uses 150wpm for B2", () => {
    // 300 words / 150 wpm = 2 min exactly.
    expect(estimateReadingMinutes("B2", 300)).toBe(2);
  });

  it("rounds up to the next whole minute", () => {
    // 91 words / 90 wpm = 1.011... -> rounds up to 2.
    expect(estimateReadingMinutes("A2", 91)).toBe(2);
  });

  it("has a floor of 1 minute even for a tiny word count", () => {
    expect(estimateReadingMinutes("A2", 5)).toBe(1);
  });

  it("has a floor of 1 minute for zero or null word count", () => {
    expect(estimateReadingMinutes("A2", 0)).toBe(1);
    expect(estimateReadingMinutes("B1", null)).toBe(1);
  });
});

describe("seedDataProvider (via dataProvider) — seed loading", () => {
  it("getCategories returns the seeded categories", async () => {
    const categories = await dataProvider.getCategories();
    expect(categories.length).toBeGreaterThan(0);
  });

  it("getLatestEdition returns the single seeded edition with its articles resolved", async () => {
    const edition = await dataProvider.getLatestEdition();
    expect(edition).not.toBeNull();
    expect(edition?.edition_date).toBe("2026-07-10");
    // R3 only produced 2 fully worked article examples (seed-provider.ts note).
    expect(edition?.articles).toHaveLength(2);
  });

  it("getEditionByDate returns null for an unknown date", async () => {
    const edition = await dataProvider.getEditionByDate("1999-01-01");
    expect(edition).toBeNull();
  });

  it("getEditionByDate returns the matching edition for a known date", async () => {
    const edition = await dataProvider.getEditionByDate("2026-07-10");
    expect(edition).not.toBeNull();
    expect(edition?.articles.length).toBe(2);
  });

  it("articles within an edition are sorted by rank_in_edition", async () => {
    const edition = await dataProvider.getLatestEdition();
    const ranks = (edition?.articles ?? []).map((a) => a.rank_in_edition);
    const sorted = [...ranks].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ranks).toEqual(sorted);
  });

  it("getArticleBySlug resolves a known article with versions/sources/facts/category", async () => {
    const article = await dataProvider.getArticleBySlug("meta-ai-layoffs-2026");
    expect(article).not.toBeNull();
    expect(article?.versions.length).toBeGreaterThan(0);
    expect(article?.category).not.toBeNull();
  });

  it("getArticleBySlug returns null for an unknown slug", async () => {
    const article = await dataProvider.getArticleBySlug("does-not-exist");
    expect(article).toBeNull();
  });

  it("getWordsForVersion returns words for a level, sorted by sort_order", async () => {
    const article = await dataProvider.getArticleBySlug("meta-ai-layoffs-2026");
    const a2Version = article?.versions.find((v) => v.level === "A2");
    expect(a2Version).toBeTruthy();

    const words = await dataProvider.getWordsForVersion(a2Version!.id);
    expect(words.length).toBeGreaterThan(0);
    const orders = words.map((w) => w.sort_order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("getWordsForVersion returns an empty array for an unknown version id", async () => {
    const words = await dataProvider.getWordsForVersion("no-such-version");
    expect(words).toEqual([]);
  });
});
