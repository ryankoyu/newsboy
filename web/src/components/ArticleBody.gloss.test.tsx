import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ArticleBody } from "@/components/ArticleBody";
import type { Gloss, Word } from "@/lib/types";

/**
 * Tapping a word that is not one of a level's curated five.
 *
 * That is most of the page — a B2 article runs 450-520 words against five
 * curated ones — and until 2026-08-16 every one of those taps opened a card
 * that said 뜻 준비 중 and promised a lookup that was never coming. These
 * tests pin the three outcomes a tap can now have: the curated entry, the
 * dictionary gloss, and the honest empty card for a word that has no meaning
 * to give.
 */

const curated = (term: string, meaning: string): Word => ({
  id: `w-${term}`,
  version_id: "v1",
  term,
  meaning_ko: meaning,
  example: `An example using ${term}.`,
  pronunciation: "/ˈtest/",
  sort_order: 1,
  is_key: false,
  pos: "n.",
});

const gloss = (term: string, meaning: string, pos: string | null = "n."): Gloss => ({
  term,
  meaning_ko: meaning,
  pos,
});

function renderBody(options: { words?: Word[]; glosses?: Record<string, Gloss> } = {}) {
  return render(
    <ArticleBody
      articleId="a1"
      level="B1"
      sentences={["Rescuers searched the ferry overnight.", "Nikkei reported the delay."]}
      words={options.words ?? []}
      glosses={options.glosses}
    />
  );
}

// jsdom doesn't implement matchMedia — SmartDictionary calls it directly to
// pick between the mobile sheet and the desktop popover.
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

describe("ArticleBody — tapping an uncurated word", () => {
  it("shows the dictionary meaning", () => {
    renderBody({ glosses: { rescuers: gloss("rescuers", "구조대원들") } });
    fireEvent.click(screen.getByText("Rescuers"));
    expect(screen.getByText("구조대원들")).toBeInTheDocument();
  });

  it("matches regardless of the capitalization on the page", () => {
    // The gloss is stored lowercase; the word opens a sentence.
    renderBody({ glosses: { rescuers: gloss("rescuers", "구조대원들") } });
    fireEvent.click(screen.getByText("Rescuers"));
    expect(screen.getByText("구조대원들")).toBeInTheDocument();
  });

  it("shows the part of speech when the dictionary has one", () => {
    renderBody({ glosses: { overnight: gloss("overnight", "밤새", "adv.") } });
    fireEvent.click(screen.getByText("overnight"));
    expect(screen.getByText("adv.")).toBeInTheDocument();
  });

  it("says the word has no meaning rather than promising one later", () => {
    // A proper noun: the pipeline refuses to gloss it, because describing a
    // publication is asserting a fact about the world.
    renderBody({ glosses: { rescuers: gloss("rescuers", "구조대원들") } });
    fireEvent.click(screen.getByText("Nikkei"));
    expect(screen.getByText(/뜻을 붙이지 않았어요/)).toBeInTheDocument();
    expect(screen.queryByText(/알려드릴게요/)).not.toBeInTheDocument();
  });

  it("keeps working with no dictionary at all — the committed seed's case", () => {
    renderBody();
    fireEvent.click(screen.getByText("ferry"));
    expect(screen.getByText(/뜻을 붙이지 않았어요/)).toBeInTheDocument();
  });
});

describe("ArticleBody — a curated word outranks the dictionary", () => {
  it("shows the curated meaning, example and pronunciation, not the gloss", () => {
    renderBody({
      words: [curated("ferry", "여객선 (엄선된 뜻)")],
      glosses: { ferry: gloss("ferry", "나룻배 (사전 뜻)") },
    });
    fireEvent.click(screen.getByText("ferry"));
    expect(screen.getByText("여객선 (엄선된 뜻)")).toBeInTheDocument();
    expect(screen.queryByText("나룻배 (사전 뜻)")).not.toBeInTheDocument();
    // The reason it outranks: it carries what a gloss does not.
    // Rendered inside typographic quotes, hence the regex.
    expect(screen.getByText(/An example using ferry\./)).toBeInTheDocument();
  });
});
