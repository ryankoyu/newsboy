// Preview fixtures — the app's own seed data, joined exactly the way
// src/lib/data/seed-provider.ts joins it.
//
// The real provider is async (its DataProvider methods are `async` even
// though every one of them is pure lookup over these same JSON files), and a
// preview card renders once, statically — so this module repeats the joins
// synchronously instead of racing a promise against the screenshot.
//
// Nothing here is invented: every field comes from src/lib/data/seed/*.json,
// which was converted 1:1 from the R3 pipeline experiment.

import type {
  Article,
  ArticleVersion,
  ArticleWithDetails,
  Category,
  Edition,
  EditionWithArticles,
  Fact,
  Source,
  Word,
} from "@/lib/types";

import categoriesJson from "@/lib/data/seed/categories.json";
import editionsJson from "@/lib/data/seed/editions.json";
import articlesJson from "@/lib/data/seed/articles.json";
import articleVersionsJson from "@/lib/data/seed/article_versions.json";
import sourcesJson from "@/lib/data/seed/sources.json";
import factsJson from "@/lib/data/seed/facts.json";
import wordsJson from "@/lib/data/seed/words.json";

export const categories = categoriesJson as Category[];
const editions = editionsJson as Edition[];
const rawArticles = articlesJson as Article[];
const articleVersions = articleVersionsJson as ArticleVersion[];
const sources = sourcesJson as Source[];
const facts = factsJson as Fact[];
export const words = wordsJson as Word[];

function withDetails(article: Article): ArticleWithDetails {
  return {
    ...article,
    category: categories.find((c) => c.id === article.category_id) ?? null,
    versions: articleVersions.filter((v) => v.article_id === article.id),
    sources: sources.filter((s) => s.article_id === article.id),
    facts: facts.filter((f) => f.article_id === article.id),
  };
}

/** The seed edition (2026-07-13), Top-10 articles resolved and ranked. */
export const edition: EditionWithArticles = (() => {
  const latest = [...editions].sort((a, b) =>
    a.edition_date < b.edition_date ? 1 : -1
  )[0];
  return {
    ...latest,
    articles: rawArticles
      .filter((a) => a.edition_id === latest.id)
      .sort((a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0))
      .map(withDetails),
  };
})();

export const articles = edition.articles;

/** Rank-1 article — the one the home screen leads with. */
export const article = articles[0];

/** Rank-2 article — for "next up" / list-of-two compositions. */
export const secondArticle = articles[1];

export function versionOf(a: ArticleWithDetails, level: "A2" | "B1" | "B2") {
  return a.versions.find((v) => v.level === level) ?? a.versions[0];
}

export function wordsForVersion(versionId: string): Word[] {
  return words
    .filter((w) => w.version_id === versionId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Category rows keyed by slug, for components that take a Category. */
export function categoryBySlug(slug: string): Category {
  return categories.find((c) => c.slug === slug) ?? categories[0];
}

export type { ArticleWithDetails, EditionWithArticles, Source, Word, Category };
