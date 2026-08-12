import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { NewsprintMyView } from "@/components/newsprint/NewsprintMyView";
import { localSessionStore } from "@/lib/session";
import type {
  Article,
  ArticleVersion,
  ArticleWithDetails,
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

vi.mock("next/navigation", () => ({
  usePathname: () => "/saved",
}));

function buildSeedEdition(): EditionWithArticles {
  const edition = editionsJson[0];
  const editionArticles: ArticleWithDetails[] = articles
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

afterEach(() => {
  cleanup();
});

describe("NewsprintMyView — the sentence drawer", () => {
  it("lets a saved sentence be taken back out, the way saved words already could", async () => {
    const edition = buildSeedEdition();
    const article = edition.articles[0];
    const version = article.versions[0];
    localSessionStore.toggleSavedSentence({
      articleId: article.id,
      level: version.level as "A2",
      sentenceIndex: 0,
      text: version.sentences[0],
      savedAt: new Date().toISOString(),
    });

    render(<NewsprintMyView edition={edition} />);

    fireEvent.click(await screen.findByRole("button", { name: /Sentences \(1\)/ }));
    const remove = await screen.findByRole("button", { name: "저장한 문장에서 빼기" });

    fireEvent.click(remove);

    await waitFor(() => {
      expect(localSessionStore.getSavedSentences()).toHaveLength(0);
    });
    expect(screen.getByText("아직 저장한 문장이 없어요.")).toBeInTheDocument();
  });
});
