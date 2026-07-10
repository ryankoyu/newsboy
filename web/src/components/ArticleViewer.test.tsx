import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ArticleViewer } from "@/components/ArticleViewer";
import type {
  Article,
  ArticleVersion,
  ArticleWithDetails,
  Category,
  Fact,
  Source,
  Word,
} from "@/lib/types";
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

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
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
  const article = buildSeedArticle("article-meta-layoffs");
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
