import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { ArticleViewer } from "@/components/ArticleViewer";
import { sessionStore } from "@/lib/session";
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

const articles = articlesJson as Article[];
const articleVersions = articleVersionsJson as ArticleVersion[];
const categories = categoriesJson as Category[];
const sources = sourcesJson as Source[];
const facts = factsJson as Fact[];
const words = wordsJson as Word[];

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
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

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
});

// This project's vitest config doesn't set `globals: true`, so
// @testing-library/react's built-in auto-cleanup (which checks for a global
// `afterEach`) never registers — every `render()` in this file would
// otherwise accumulate in the document across tests. Register cleanup
// explicitly so each test starts from an empty document.
afterEach(() => {
  cleanup();
});

/**
 * ArticleBody renders each sentence as a run of separate <span> tokens (for
 * per-word click targets), so a full sentence is split across multiple text
 * nodes and RTL's getByText(exactString) won't find it. Compare against the
 * article body container's textContent instead.
 */
function getArticleBodyText(container: HTMLElement): string {
  const body = container.querySelector(".briefly-article-body");
  return body?.textContent ?? "";
}

describe("ArticleViewer", () => {
  // Use the rank-1 seed article rather than a hardcoded id, so this test
  // keeps working across edition swaps (task: derive from seed, not hardcode).
  const firstArticleId = [...articles].sort(
    (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
  )[0].id;
  const article = buildSeedArticle(firstArticleId);
  const wordsByVersion = buildWordsByVersion(article);

  it("renders the A2 body by default and switches body content when the level changes", async () => {
    const { container } = render(
      <ArticleViewer
        article={article}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={wordsByVersion}
      />
    );

    const a2Version = article.versions.find((v) => v.level === "A2")!;
    const b2Version = article.versions.find((v) => v.level === "B2")!;

    await waitFor(() => {
      expect(screen.getByText(a2Version.title)).toBeInTheDocument();
    });
    // The B2 version's first sentence should not be present while on A2.
    expect(getArticleBodyText(container)).toContain(a2Version.sentences[0]);
    expect(getArticleBodyText(container)).not.toContain(b2Version.sentences[0]);

    // Switch to B2 via the level switcher (a role="tab" segmented control).
    const b2Control = screen.getByRole("tab", { name: "B2" });
    fireEvent.click(b2Control);

    await waitFor(() => {
      expect(getArticleBodyText(container)).toContain(b2Version.sentences[0]);
    });
    // A2's first sentence should no longer be present after switching.
    expect(getArticleBodyText(container)).not.toContain(a2Version.sentences[0]);
  });

  it("renders the article title as a heading and shows the sources section", async () => {
    render(
      <ArticleViewer
        article={article}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={wordsByVersion}
      />
    );

    const a2Version = article.versions.find((v) => v.level === "A2")!;
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: a2Version.title })
      ).toBeInTheDocument();
    });
  });

    });

describe("ArticleViewer — continuous reading flow (enhancement-plan.md Batch 1 #2/#3)", () => {
  const edition = buildSeedEdition();
  const rankedArticles = [...edition.articles].sort(
    (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
  );

  it("shows a quiet N/total progress indicator reflecting read articles in this edition", async () => {
    const first = rankedArticles[0];
    sessionStore.markRead(rankedArticles[1].id); // one other article already read

    render(
      <ArticleViewer
        article={first}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={buildWordsByVersion(first)}
        edition={edition}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByLabelText(`오늘의 브리핑 진행 1 / ${rankedArticles.length}`)
      ).toBeInTheDocument();
    });
  });

  it("shows a 'next article' card linking to the next-ranked article when not on the last one", async () => {
    const first = rankedArticles[0];
    const second = rankedArticles[1];
    const secondA2 = second.versions.find((v) => v.level === "A2") ?? second.versions[0];

    render(
      <ArticleViewer
        article={first}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={buildWordsByVersion(first)}
        edition={edition}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("다음 기사 →")).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: new RegExp(secondA2.title) });
    expect(link).toHaveAttribute("href", `/article/${second.slug}?level=${secondA2.level}`);
  });

  it("shows the completion card instead of a next-article card once every article today is read", async () => {
    for (const a of rankedArticles) {
      sessionStore.markRead(a.id);
    }
    const last = rankedArticles[rankedArticles.length - 1];

    render(
      <ArticleViewer
        article={last}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={buildWordsByVersion(last)}
        edition={edition}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("오늘의 브리핑 끝!")).toBeInTheDocument();
    });
    expect(screen.queryByText("다음 기사 →")).not.toBeInTheDocument();
    expect(screen.getByText("나의 주간 브리핑", { exact: false })).toBeInTheDocument();
  });

  it("degrades gracefully with no progress/next-article UI when edition is omitted", async () => {
    const first = rankedArticles[0];
    render(
      <ArticleViewer
        article={first}
        initialLevel="A2"
        hasExplicitLevel
        wordsByVersion={buildWordsByVersion(first)}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1 })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("다음 기사 →")).not.toBeInTheDocument();
    expect(screen.queryByText("오늘의 브리핑 끝!")).not.toBeInTheDocument();
  });
});
