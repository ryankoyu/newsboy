import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { NewsprintFrontPage } from "@/components/newsprint/NewsprintFrontPage";
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

/**
 * The front page is the light-mode home screen (useNewsprintSkin), so it is
 * the only place most readers can be offered the level test — and the only
 * page that has to survive a version-less article at rank 1.
 */

const articles = articlesJson as Article[];
const articleVersions = articleVersionsJson as ArticleVersion[];
const categories = categoriesJson as Category[];
const sources = sourcesJson as Source[];
const facts = factsJson as Fact[];

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
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

describe("NewsprintFrontPage — the level test has an entry point", () => {
  it("offers the level diagnosis to a reader who has not onboarded", async () => {
    render(<NewsprintFrontPage edition={buildSeedEdition()} />);

    const link = await screen.findByRole("link", { name: /1분 레벨 진단하기/ });
    expect(link).toHaveAttribute("href", "/onboarding");
  });

  it("stays dismissed once the reader closes it", async () => {
    render(<NewsprintFrontPage edition={buildSeedEdition()} />);

    await screen.findByRole("link", { name: /1분 레벨 진단하기/ });
    fireEvent.click(screen.getByRole("button", { name: "배너 닫기" }));

    await waitFor(() => {
      expect(screen.queryByRole("link", { name: /1분 레벨 진단하기/ })).not.toBeInTheDocument();
    });
    expect(localSessionStore.hasDismissedOnboardingBanner()).toBe(true);
  });

  it("does not nudge a reader who already took the test", async () => {
    localSessionStore.setOnboarded(true);
    render(<NewsprintFrontPage edition={buildSeedEdition()} />);

    // Wait for hydration to swap in the real store before asserting absence.
    await screen.findByRole("navigation", { name: "주요 메뉴" });
    expect(screen.queryByRole("link", { name: /1분 레벨 진단하기/ })).not.toBeInTheDocument();
  });
});

describe("NewsprintFrontPage — an edition holding a version-less article", () => {
  it("sets the page from the articles that do have versions instead of crashing", async () => {
    const edition = buildSeedEdition();
    const [first, second, ...rest] = edition.articles;
    const broken: EditionWithArticles = {
      ...edition,
      articles: [{ ...first, versions: [] }, second, ...rest],
    };

    render(<NewsprintFrontPage edition={broken} />);

    // The next-ranked article leads the page, and its headline links out.
    const secondTitle = second.versions.find((v) => v.level === "A2") ?? second.versions[0];
    expect(
      await screen.findByRole("link", { name: secondTitle.title })
    ).toBeInTheDocument();
  });

  it("falls back to the empty state when NO article can be typeset", async () => {
    const edition = buildSeedEdition();
    const broken: EditionWithArticles = {
      ...edition,
      articles: edition.articles.map((a) => ({ ...a, versions: [] })),
    };

    render(<NewsprintFrontPage edition={broken} />);

    expect(
      await screen.findByText("오늘의 브리핑을 준비하고 있어요.")
    ).toBeInTheDocument();
  });
});
