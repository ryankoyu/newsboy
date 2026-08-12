import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { NewsprintArticleViewer } from "@/components/newsprint/NewsprintArticleViewer";
import { localSessionStore, sessionStore } from "@/lib/session";
import type {
  Article,
  ArticleVersion,
  ArticleWithDetails,
  Category,
  EditionWithArticles,
  Fact,
  Source,
  Word,
} from "@/lib/types";
import editionsJson from "@/lib/data/seed/editions.json";
import articlesJson from "@/lib/data/seed/articles.json";
import articleVersionsJson from "@/lib/data/seed/article_versions.json";
import categoriesJson from "@/lib/data/seed/categories.json";
import sourcesJson from "@/lib/data/seed/sources.json";
import factsJson from "@/lib/data/seed/facts.json";
import wordsJson from "@/lib/data/seed/words.json";

/**
 * The newsprint reader is what a DEFAULT (light-mode) user sees —
 * useNewsprintSkin returns true unless dark mode is on — so anything broken
 * here is broken for almost everyone. These tests pin the affordances that
 * were missing or dead: saving an article, the word index, today's progress,
 * the completion block, the provenance link, and not dying on an article
 * with no versions.
 */

const articles = articlesJson as Article[];
const articleVersions = articleVersionsJson as ArticleVersion[];
const categories = categoriesJson as Category[];
const sources = sourcesJson as Source[];
const facts = factsJson as Fact[];
const words = wordsJson as Word[];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function buildSeedArticle(articleId: string): ArticleWithDetails {
  const article = articles.find((a) => a.id === articleId)!;
  return {
    ...article,
    category: categories.find((c) => c.id === article.category_id) ?? null,
    versions: articleVersions.filter((v) => v.article_id === article.id),
    sources: sources.filter((s) => s.article_id === article.id),
    facts: facts.filter((f) => f.article_id === article.id),
  };
}

function buildWordsByVersion(article: ArticleWithDetails): Record<string, Word[]> {
  const map: Record<string, Word[]> = {};
  for (const v of article.versions) {
    map[v.id] = words
      .filter((w) => w.version_id === v.id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }
  return map;
}

function buildSeedEdition(): EditionWithArticles {
  const edition = editionsJson[0];
  const editionArticles = articles
    .filter((a) => a.edition_id === edition.id)
    .sort((a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0))
    .map((a) => buildSeedArticle(a.id));
  return { ...edition, articles: editionArticles } as EditionWithArticles;
}

const rankedIds = [...articles]
  .sort((a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0))
  .map((a) => a.id);

beforeEach(() => {
  window.localStorage.clear();
});

// This project's vitest config doesn't set `globals: true`, so RTL's
// automatic afterEach(cleanup) never registers — unmount explicitly.
afterEach(() => {
  cleanup();
});

describe("NewsprintArticleViewer — saving", () => {
  const article = buildSeedArticle(rankedIds[0]);
  const wordsByVersion = buildWordsByVersion(article);

  it("saves the article — the foot bar's 저장 is a real button wired to the bookmark store", async () => {
    render(
      <NewsprintArticleViewer
        article={article}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={wordsByVersion}
      />
    );

    const save = await screen.findByRole("button", { name: "저장" });
    expect(save).toHaveAttribute("aria-pressed", "false");
    expect(localSessionStore.isBookmarked(article.id)).toBe(false);

    fireEvent.click(save);

    await waitFor(() => {
      expect(localSessionStore.isBookmarked(article.id)).toBe(true);
    });
    expect(screen.getByRole("button", { name: "저장 취소" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // And it toggles back off, so a mis-tap is recoverable.
    fireEvent.click(screen.getByRole("button", { name: "저장 취소" }));
    await waitFor(() => {
      expect(localSessionStore.isBookmarked(article.id)).toBe(false);
    });
  });

  it("does not print controls for features the app does not have (듣기 / 더보기)", async () => {
    render(
      <NewsprintArticleViewer
        article={article}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={wordsByVersion}
      />
    );

    await screen.findByRole("button", { name: "저장" });
    expect(screen.queryByText("듣기")).not.toBeInTheDocument();
    expect(screen.queryByText("더보기")).not.toBeInTheDocument();
  });
});

describe("NewsprintArticleViewer — an article with no versions", () => {
  it("says so instead of crashing", async () => {
    const article = buildSeedArticle(rankedIds[0]);
    const versionless: ArticleWithDetails = { ...article, versions: [] };

    render(
      <NewsprintArticleViewer
        article={versionless}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={{}}
      />
    );

    expect(
      await screen.findByText("이 기사의 레벨 버전을 찾을 수 없습니다.")
    ).toBeInTheDocument();
  });
});

describe("NewsprintArticleViewer — what the standard reader also offers", () => {
  const article = buildSeedArticle(rankedIds[0]);
  const wordsByVersion = buildWordsByVersion(article);

  it("prints the story's words as an index, each one savable to the wordbook", async () => {
    const a2 = article.versions.find((v) => v.level === "A2")!;
    const storyWords = wordsByVersion[a2.id];
    expect(storyWords.length).toBeGreaterThan(0);

    render(
      <NewsprintArticleViewer
        article={article}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={wordsByVersion}
      />
    );

    const first = storyWords[0];
    const take = await screen.findByRole("button", { name: `${first.term} 단어장 담기` });
    fireEvent.click(take);

    await waitFor(() => {
      expect(localSessionStore.isWordSaved(first.term)).toBe(true);
    });
  });

  it("links to /about beside the cross-check notice", async () => {
    render(
      <NewsprintArticleViewer
        article={article}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={wordsByVersion}
      />
    );

    const link = await screen.findByRole("link", { name: /우리가 뉴스를 만드는 방법/ });
    expect(link).toHaveAttribute("href", "/about");
  });

  it("shows today's progress against the edition", async () => {
    const edition = buildSeedEdition();
    sessionStore.markRead(edition.articles[1].id);

    render(
      <NewsprintArticleViewer
        article={edition.articles[0]}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={buildWordsByVersion(edition.articles[0])}
        edition={edition}
      />
    );

    expect(
      await screen.findByLabelText(`오늘의 브리핑 진행 1 / ${edition.articles.length}`)
    ).toBeInTheDocument();
  });

  it("reaches the weekly brief through the completion block once the whole brief is read", async () => {
    const edition = buildSeedEdition();
    for (const a of edition.articles) sessionStore.markRead(a.id);
    const last = edition.articles[edition.articles.length - 1];

    render(
      <NewsprintArticleViewer
        article={last}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={buildWordsByVersion(last)}
        edition={edition}
      />
    );

    expect(await screen.findByText("오늘의 브리핑 끝!")).toBeInTheDocument();
    expect(screen.getByText("나의 주간 브리핑")).toBeInTheDocument();
    expect(screen.queryByText("Next in Today’s Brief")).not.toBeInTheDocument();
  });
});
