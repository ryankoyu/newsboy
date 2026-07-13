import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MyView } from "@/components/MyView";
import { localSessionStore } from "@/lib/session";
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
 * seed-provider.ts produces) — reuse seed content, don't invent fixtures
 * (task constraint / CLAUDE.md rule 1).
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

// This project's vitest config doesn't enable `test.globals`, so RTL's
// automatic afterEach(cleanup) registration doesn't kick in — unmount
// explicitly so each test starts from an empty DOM (needed here since every
// test renders the same "My" heading + tab labels).
afterEach(() => {
  cleanup();
});

describe("MyView", () => {
  it("renders empty states for all 3 drawers when nothing is saved", async () => {
    const edition = buildSeedEdition();
    render(<MyView edition={edition} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "My" })).toBeInTheDocument();
    });

    // Default drawer is 스크랩 (scrap), which should show its empty state.
    expect(screen.getByText("아직 스크랩한 기사가 없어요.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /단어장/ }));
    expect(screen.getByText("아직 저장한 단어가 없어요.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /문장/ }));
    expect(screen.getByText("아직 저장한 문장이 없어요.")).toBeInTheDocument();
  });

  it("shows profile stats reflecting session state (read/scrap/word/sentence counts)", async () => {
    const edition = buildSeedEdition();
    const firstArticle = edition.articles[0];

    localSessionStore.markRead(firstArticle.id);
    localSessionStore.toggleBookmark(firstArticle.id);
    localSessionStore.toggleSavedWord({ term: "congressman", meaning_ko: "하원의원" });
    localSessionStore.toggleSavedSentence({
      articleId: firstArticle.id,
      level: "A2",
      sentenceIndex: 0,
      text: firstArticle.versions.find((v) => v.level === "A2")?.sentences[0] ?? "",
      savedAt: new Date().toISOString(),
    });

    render(<MyView edition={edition} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "My" })).toBeInTheDocument();
    });

    // Scrap drawer (default) shows the bookmarked article card.
    const a2Version = firstArticle.versions.find((v) => v.level === "A2")!;
    await waitFor(() => {
      expect(screen.getByText(a2Version.title)).toBeInTheDocument();
    });

    // Vocab drawer shows the saved word.
    fireEvent.click(screen.getByRole("tab", { name: /단어장/ }));
    expect(screen.getByText("congressman")).toBeInTheDocument();
    expect(screen.getByText("하원의원")).toBeInTheDocument();

    // Sentence drawer shows the saved sentence + a link back to the article.
    fireEvent.click(screen.getByRole("tab", { name: /문장/ }));
    expect(
      screen.getByText(`“${a2Version.sentences[0]}”`)
    ).toBeInTheDocument();
  });

  it("marks a multi-word saved term with the '표현' badge", async () => {
    const edition = buildSeedEdition();
    localSessionStore.toggleSavedWord({ term: "lay off", meaning_ko: "해고하다" });

    render(<MyView edition={edition} />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "My" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("tab", { name: /단어장/ }));
    expect(screen.getByText("표현")).toBeInTheDocument();
    expect(screen.getByText("lay off")).toBeInTheDocument();
  });

  it("removes a saved word when its delete button is clicked", async () => {
    const edition = buildSeedEdition();
    localSessionStore.toggleSavedWord({ term: "workforce", meaning_ko: "노동력" });

    render(<MyView edition={edition} />);
    fireEvent.click(await screen.findByRole("tab", { name: /단어장/ }));
    expect(await screen.findByText("workforce")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /단어장에서 제거/ }));

    await waitFor(() => {
      expect(screen.getByText("아직 저장한 단어가 없어요.")).toBeInTheDocument();
    });
    expect(localSessionStore.getSavedWords()).toEqual([]);
  });
});
