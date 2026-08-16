import { describe, it, expect } from "vitest";
import { dataProvider, estimateReadingMinutes } from "@/lib/data";
import { seedDataProvider } from "@/lib/data/seed-provider";
import { collectBodyTerms } from "@/lib/glossTerms";
import editionsJson from "@/lib/data/seed/editions.json";
import articlesJson from "@/lib/data/seed/articles.json";

const seedEdition = editionsJson[0];
const seedArticleCount = articlesJson.length;
const firstSeedArticle = [...articlesJson].sort(
  (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
)[0];

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
    expect(edition?.edition_date).toBe(seedEdition.edition_date);
    expect(edition?.articles).toHaveLength(seedArticleCount);
  });

  it("getEditionByDate returns null for an unknown date", async () => {
    const edition = await dataProvider.getEditionByDate("1999-01-01");
    expect(edition).toBeNull();
  });

  it("getEditionByDate returns the matching edition for a known date", async () => {
    const edition = await dataProvider.getEditionByDate(seedEdition.edition_date);
    expect(edition).not.toBeNull();
    expect(edition?.articles.length).toBe(seedArticleCount);
  });

  it("articles within an edition are sorted by rank_in_edition", async () => {
    const edition = await dataProvider.getLatestEdition();
    const ranks = (edition?.articles ?? []).map((a) => a.rank_in_edition);
    const sorted = [...ranks].sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(ranks).toEqual(sorted);
  });

  it("getArticleBySlug resolves a known article with versions/sources/facts/category", async () => {
    const article = await dataProvider.getArticleBySlug(firstSeedArticle.slug);
    expect(article).not.toBeNull();
    expect(article?.versions.length).toBeGreaterThan(0);
    expect(article?.category).not.toBeNull();
  });

  it("getArticleBySlug returns null for an unknown slug", async () => {
    const article = await dataProvider.getArticleBySlug("does-not-exist");
    expect(article).toBeNull();
  });

  it("getWordsForVersion returns words for a level, sorted by sort_order", async () => {
    const article = await dataProvider.getArticleBySlug(firstSeedArticle.slug);
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

  it("listEditions returns all seeded editions, newest first (enhancement-plan.md Batch 1 #4)", async () => {
    const editions = await dataProvider.listEditions();
    expect(editions.length).toBeGreaterThan(0);
    const dates = editions.map((e) => e.edition_date);
    expect(dates).toEqual([...dates].sort((a, b) => (a < b ? 1 : -1)));
  });

  it("listEditions results are each resolvable via getEditionByDate", async () => {
    const editions = await dataProvider.listEditions();
    for (const e of editions) {
      const resolved = await dataProvider.getEditionByDate(e.edition_date);
      expect(resolved).not.toBeNull();
      expect(resolved?.id).toBe(e.id);
    }
  });
});

/**
 * The committed seed's dictionary.
 *
 * It shipped empty, because there was no way to make one; the pipeline's
 * glossary stage then gave the seed the same treatment the live site gets
 * (pipeline/src/scripts/run-seed-glossary.ts). These pin the two properties a
 * reader depends on — that ordinary words in the seed's own articles resolve,
 * and that proper nouns still resolve to nothing.
 */
describe("seed glossary", () => {
  it("has a meaning for ordinary words in the seed's articles", async () => {
    const glosses = await seedDataProvider.getGlosses(["exports", "announced", "semiconductors"]);
    expect(glosses.exports?.meaning_ko).toBeTruthy();
    expect(glosses.announced?.meaning_ko).toBeTruthy();
    expect(glosses.semiconductors?.meaning_ko).toBeTruthy();
  });

  it("has none for proper nouns — describing a company or a person is a claim about the world", () => {
    return seedDataProvider.getGlosses(["samsung", "seoul", "trump"]).then((glosses) => {
      expect(glosses.samsung).toBeUndefined();
      expect(glosses.seoul).toBeUndefined();
      expect(glosses.trump).toBeUndefined();
    });
  });

  it("covers the seed bodies it was generated from", async () => {
    // Not 100%: the proper nouns above are deliberate holes. The floor is set
    // well under the measured 96.7% so an edition with more names in it does
    // not fail the suite, while a collapse in coverage still does.
    const versions = (await import("@/lib/data/seed/article_versions.json")).default as Array<{
      content: string;
    }>;
    const terms = collectBodyTerms(versions.map((v) => v.content));
    const glosses = await seedDataProvider.getGlosses(terms);
    const covered = terms.filter((t) => glosses[t]).length;
    expect(covered / terms.length).toBeGreaterThan(0.9);
  });
});
