import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HomeView } from "@/components/HomeView";
import type {
  Article,
  ArticleVersion,
  Category,
  EditionWithArticles,
  Fact,
  Source,
} from "@/lib/types";
import editionsJson from "@/lib/data/seed/editions.json";
import articlesJson from "@/lib/data/seed/articles.json";
import articleVersionsJson from "@/lib/data/seed/article_versions.json";
import categoriesJson from "@/lib/data/seed/categories.json";
import sourcesJson from "@/lib/data/seed/sources.json";
import factsJson from "@/lib/data/seed/facts.json";

const articles = articlesJson as Article[];
const articleVersions = articleVersionsJson as ArticleVersion[];
const categories = categoriesJson as Category[];
const sources = sourcesJson as Source[];
const facts = factsJson as Fact[];

/**
 * Build a real EditionWithArticles from the seed JSON (same shape
 * seed-provider.ts produces) rather than inventing fixture content —
 * task constraint: reuse existing seed content, don't author new fixtures.
 */
function buildSeedEdition(): EditionWithArticles {
  const edition = editionsJson[0];
  const editionArticles = articles
    .filter((a) => a.edition_id === edition.id)
    .sort((a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0))
    .map((article) => ({
      ...article,
      category: categories.find((c) => c.id === article.category_id) ?? null,
      versions: articleVersions.filter((v) => v.article_id === article.id),
      sources: sources.filter((s) => s.article_id === article.id),
      facts: facts.filter((f) => f.article_id === article.id),
    }));

  return { ...edition, articles: editionArticles } as EditionWithArticles;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("HomeView", () => {
  it("renders the seeded Top 10 articles with no 'coming soon' slot remaining", async () => {
    const edition = buildSeedEdition();
    render(<HomeView edition={edition} />);

    // hydration flips hydrated=true asynchronously (useSyncExternalStore).
    await waitFor(() => {
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    // The seed edition has a full Top 10, so every rank-1 A2 version title
    // (and the last one) should render, and no "coming soon" slot remains.
    const sortedArticles = [...articles].sort(
      (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
    );
    expect(sortedArticles).toHaveLength(10);

    const firstVersion = articleVersionsJson.find(
      (v) => v.article_id === sortedArticles[0].id && v.level === "A2"
    );
    expect(firstVersion).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(firstVersion!.title)).toBeInTheDocument();
    });

    const lastVersion = articleVersionsJson.find(
      (v) => v.article_id === sortedArticles[sortedArticles.length - 1].id && v.level === "A2"
    );
    expect(screen.getByText(lastVersion!.title)).toBeInTheDocument();

    // 10 real articles fill the Top 10, so no "coming soon" slot should render.
    expect(screen.queryByText(/기사는 준비 중이에요/)).not.toBeInTheDocument();
  });

  it("renders the empty state when there is no edition", async () => {
    render(<HomeView edition={null} />);
    await waitFor(() => {
      expect(
        screen.getByText("오늘의 브리핑을 준비하고 있어요.")
      ).toBeInTheDocument();
    });
  });
});
