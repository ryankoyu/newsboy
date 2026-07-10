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
  it("renders the 2 seeded articles plus a 'coming soon' slot for the remaining 8 of Top 10", async () => {
    const edition = buildSeedEdition();
    render(<HomeView edition={edition} />);

    // hydration flips hydrated=true asynchronously (useSyncExternalStore).
    await waitFor(() => {
      expect(screen.getByRole("main")).toBeInTheDocument();
    });

    const version = articleVersionsJson.find(
      (v) => v.article_id === "article-meta-layoffs" && v.level === "A2"
    );
    expect(version).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(version!.title)).toBeInTheDocument();
    });

    const worldCupVersion = articleVersionsJson.find(
      (v) => v.article_id === "article-norway-brazil" && v.level === "A2"
    );
    expect(screen.getByText(worldCupVersion!.title)).toBeInTheDocument();

    // 2 real articles + 8 missing slots out of Top 10.
    expect(screen.getByText(/나머지 8개 기사는 준비 중이에요/)).toBeInTheDocument();
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
