import type {
  Category,
  Edition,
  Article,
  ArticleVersion,
  Source,
  Fact,
  FactSource,
  Word,
  EditionWithArticles,
  ArticleWithDetails,
} from "@/lib/types";
import type { DataProvider } from "@/lib/data/provider";

import categoriesJson from "@/lib/data/seed/categories.json";
import editionsJson from "@/lib/data/seed/editions.json";
import articlesJson from "@/lib/data/seed/articles.json";
import articleVersionsJson from "@/lib/data/seed/article_versions.json";
import sourcesJson from "@/lib/data/seed/sources.json";
import factsJson from "@/lib/data/seed/facts.json";
import factSourcesJson from "@/lib/data/seed/fact_sources.json";
import wordsJson from "@/lib/data/seed/words.json";

const categories = categoriesJson as Category[];
const editions = editionsJson as Edition[];
const articles = articlesJson as Article[];
const articleVersions = articleVersionsJson as ArticleVersion[];
const sources = sourcesJson as Source[];
const facts = factsJson as Fact[];
const factSources = factSourcesJson as FactSource[];
const words = wordsJson as Word[];

function buildArticleWithDetails(article: Article): ArticleWithDetails {
  return {
    ...article,
    category: categories.find((c) => c.id === article.category_id) ?? null,
    versions: articleVersions.filter((v) => v.article_id === article.id),
    sources: sources.filter((s) => s.article_id === article.id),
    facts: facts.filter((f) => f.article_id === article.id),
  };
}

function buildEditionWithArticles(edition: Edition): EditionWithArticles {
  const editionArticles = articles
    .filter((a) => a.edition_id === edition.id)
    .sort((a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0))
    .map(buildArticleWithDetails);

  return { ...edition, articles: editionArticles };
}

/**
 * Seed-backed implementation of DataProvider. Reads from the static JSON
 * files in src/lib/data/seed/ (converted 1:1 from
 * docs/research/r3-pipeline-experiment.md — no invented content).
 *
 * Only 2 of the intended Top 10 articles exist, because R3 only produced 2
 * fully worked examples. This is intentional — do not pad with invented
 * articles.
 */
export const seedDataProvider: DataProvider = {
  async getCategories() {
    return categories;
  },

  async getLatestEdition() {
    if (editions.length === 0) return null;
    const latest = [...editions].sort((a, b) =>
      a.edition_date < b.edition_date ? 1 : -1
    )[0];
    return buildEditionWithArticles(latest);
  },

  async getEditionByDate(editionDate: string) {
    const edition = editions.find((e) => e.edition_date === editionDate);
    return edition ? buildEditionWithArticles(edition) : null;
  },

  async getArticleBySlug(slug: string) {
    const article = articles.find((a) => a.slug === slug);
    return article ? buildArticleWithDetails(article) : null;
  },

  async getWordsForVersion(versionId: string) {
    return words
      .filter((w) => w.version_id === versionId)
      .sort((a, b) => a.sort_order - b.sort_order);
  },
};

/** Provenance lookup helper — not part of DataProvider (internal/audit use only, A2 §7-1). */
export function getFactSourcesForArticle(articleId: string): FactSource[] {
  const factIds = new Set(
    facts.filter((f) => f.article_id === articleId).map((f) => f.id)
  );
  return factSources.filter((fs) => factIds.has(fs.fact_id));
}
