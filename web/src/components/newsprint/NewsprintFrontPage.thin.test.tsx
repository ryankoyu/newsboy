import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NewsprintFrontPage } from "@/components/newsprint/NewsprintFrontPage";
import type { ArticleWithDetails, EditionWithArticles } from "@/lib/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

/**
 * A thin edition is the normal case, not the edge case.
 *
 * The two-source rule means most days clear the bar with one or two
 * stories, not ten. Everything on this page — a lead flanked by four
 * side-heads, then "More Top Stories" — was laid out for ten. These tests
 * pin what a reader sees when the day produced one.
 */

function makeArticle(rank: number): ArticleWithDetails {
  return {
    id: `a${rank}`,
    edition_id: "ed",
    category_id: 1,
    slug: `story-${rank}`,
    event_summary: `Deck for story ${rank}.`,
    rank_in_edition: rank,
    status: "published",
    published_at: null,
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
    category: { id: 1, slug: "world", label: "World", emoji: "🌍", sort_order: 1 },
    versions: [
      {
        id: `v${rank}`,
        article_id: `a${rank}`,
        level: "A2",
        title: `Headline number ${rank}`,
        content: "One sentence. Two sentence.",
        word_count: 4,
        created_at: "2026-08-12T00:00:00Z",
        sentences: ["One sentence.", "Two sentence."],
      },
    ],
    sources: [],
    facts: [],
  };
}

function makeEdition(count: number): EditionWithArticles {
  return {
    id: "ed",
    edition_date: "2026-08-12",
    status: "published",
    published_at: "2026-08-12T00:00:00Z",
    created_at: "2026-08-12T00:00:00Z",
    articles: Array.from({ length: count }, (_, i) => makeArticle(i + 1)),
  };
}

afterEach(() => {
  cleanup();
});

describe("front page with a one-article edition", () => {
  it("prints the lead", () => {
    render(<NewsprintFrontPage edition={makeEdition(1)} />);
    expect(screen.getByText("Headline number 1")).toBeInTheDocument();
  });

  it("does not print an empty 'More Top Stories' rule", () => {
    render(<NewsprintFrontPage edition={makeEdition(1)} />);
    // A section head over nothing reads as a page that failed to load.
    expect(screen.queryByText("More Top Stories")).not.toBeInTheDocument();
  });

  it("does not tell the reader a section is empty when they filtered nothing", () => {
    render(<NewsprintFrontPage edition={makeEdition(1)} />);
    expect(screen.queryByText(/이 섹션에 실린 기사가 없어요/)).not.toBeInTheDocument();
  });

  it("gives the engraving the whole width when there are no side-heads", () => {
    const { container } = render(<NewsprintFrontPage edition={makeEdition(1)} />);
    const hero = container.querySelector<HTMLElement>('[style*="1.35fr"]');
    expect(hero).not.toBeNull();
    // One column, not three — two of which would have been empty.
    expect(hero!.style.gridTemplateColumns).toBe("1.35fr");
  });
});

describe("front page with a two-article edition", () => {
  it("prints both stories somewhere on the page", () => {
    render(<NewsprintFrontPage edition={makeEdition(2)} />);
    expect(screen.getByText("Headline number 1")).toBeInTheDocument();
    expect(screen.getByText("Headline number 2")).toBeInTheDocument();
  });

  it("opens only the side that has a story", () => {
    const { container } = render(<NewsprintFrontPage edition={makeEdition(2)} />);
    const hero = container.querySelector<HTMLElement>('[style*="1.35fr"]');
    expect(hero!.style.gridTemplateColumns).toBe("1fr 1.35fr");
  });
});

describe("front page with a full edition", () => {
  it("still prints the rest under a section head", () => {
    render(<NewsprintFrontPage edition={makeEdition(10)} />);
    expect(screen.getByText("More Top Stories")).toBeInTheDocument();
    expect(screen.getByText("Headline number 10")).toBeInTheDocument();
  });
});
