import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { HomeView } from "@/components/HomeView";
import { ArticleViewer } from "@/components/ArticleViewer";
import { sessionStore } from "@/lib/session";
import type {
  Article,
  ArticleVersion,
  ArticleWithDetails,
  Category,
  CefrLevel,
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
 * design-decisions.md §4.8-2: "온보딩 완료자는 진단 레벨로 열림(기존 동작
 * 유지) — 이 흐름을 자동 테스트로 고정." This test locks down the full
 * chain end to end, using real components + the real localStorage-backed
 * sessionStore (not a mock), so a future refactor of any one link (level
 * resolution in ArticleViewer, the ?level= query param on ArticleCard,
 * session persistence) breaks a test immediately instead of silently
 * regressing:
 *
 *   1. Onboarding step 2 -> finish(level) -> session.setLevel(level)
 *   2. Home reads session.getLevel() and links each ArticleCard to
 *      `/article/<slug>?level=<level>`
 *   3. The article page (not exercised here — see article/[slug]/page.tsx)
 *      parses that query param into `hasExplicitLevel`/`initialLevel` and
 *      passes them to ArticleViewer, which must render that level's body.
 */

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
    map[v.id] = words.filter((w) => w.version_id === v.id).sort((a, b) => a.sort_order - b.sort_order);
  }
  return map;
}

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
});

describe("Level flow: onboarding -> home card link -> article viewer initial level", () => {
  it("carries the diagnosed level from onboarding through to the article viewer", async () => {
    const edition = buildSeedEdition();
    const rankedArticles = [...edition.articles].sort(
      (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
    );
    const firstArticle = rankedArticles[0];
    // Pick a level this article actually has a version for, and that differs
    // from the DEFAULTS.level ("A2" in session.ts) so the test would fail if
    // the flow silently fell back to the default instead of the diagnosed level.
    const diagnosedLevel: CefrLevel =
      firstArticle.versions.find((v) => v.level === "B2")?.level ??
      firstArticle.versions[0].level;
    expect(diagnosedLevel).not.toBe("A2");

    // --- Step 1: onboarding sets the level (mirrors OnboardingFlow.finish) ---
    const onboarding = render(<OnboardingFlow sampleArticle={firstArticle} />);
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));

    await waitFor(() => {
      expect(screen.getByText("어느 쪽이 편하게 읽히나요?")).toBeInTheDocument();
    });
    const radio = screen.getByRole("radio", {
      name: new RegExp(diagnosedLevel === "B2" ? "술술 읽혀요" : "쉽게 읽혀요"),
    });
    fireEvent.click(radio);
    fireEvent.click(screen.getByRole("button", { name: "이걸로 시작하기" }));

    await waitFor(() => {
      expect(sessionStore.getLevel()).toBe(diagnosedLevel);
    });
    expect(sessionStore.hasOnboarded()).toBe(true);
    onboarding.unmount();

    // --- Step 2: home renders the card link with ?level=<diagnosed level> ---
    const home = render(<HomeView edition={edition} />);
    await waitFor(() => {
      expect(screen.getByRole("main")).toBeInTheDocument();
    });
    const firstVersionAtLevel = firstArticle.versions.find((v) => v.level === diagnosedLevel)!;
    const cardLink = await screen.findByRole("link", { name: new RegExp(firstVersionAtLevel.title) });
    expect(cardLink).toHaveAttribute(
      "href",
      `/article/${firstArticle.slug}?level=${diagnosedLevel}`
    );
    home.unmount();

    // --- Step 3: article viewer, given that URL's level, renders that level's body ---
    // (mirrors article/[slug]/page.tsx's own parsing of searchParams.level)
    const detailedArticle = buildSeedArticle(firstArticle.id);
    const wordsByVersion = buildWordsByVersion(detailedArticle);
    const { container } = render(
      <ArticleViewer
        article={detailedArticle}
        initialLevel={diagnosedLevel}
        hasExplicitLevel
        wordsByVersion={wordsByVersion}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: firstVersionAtLevel.title })).toBeInTheDocument();
    });
    const body = container.querySelector(".briefly-article-body");
    expect(body?.textContent ?? "").toContain(firstVersionAtLevel.sentences[0]);
  });
});
