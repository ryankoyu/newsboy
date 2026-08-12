import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { NewsprintArticleBody } from "@/components/newsprint/NewsprintArticleBody";
import type { ArticleVersion, Word } from "@/lib/types";
import articleVersionsJson from "@/lib/data/seed/article_versions.json";
import wordsJson from "@/lib/data/seed/words.json";

/**
 * The inline dictionary is the reader's only route into a word's meaning in
 * light mode, and it opens on tap — so it owes the same contract the standard
 * skin's SmartDictionary keeps: announced as a dialog, focused, Escape to
 * dismiss, focus handed back to the word it came from.
 */

const articleVersions = articleVersionsJson as ArticleVersion[];
const words = wordsJson as Word[];

/** A seed version that actually has curated words attached. */
const version = articleVersions.find((v) => words.some((w) => w.version_id === v.id))!;
const versionWords = words
  .filter((w) => w.version_id === version.id)
  .sort((a, b) => a.sort_order - b.sort_order);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function renderBody() {
  return render(
    <NewsprintArticleBody
      articleId={version.article_id}
      level="A2"
      sentences={version.sentences}
      words={versionWords}
    />
  );
}

describe("NewsprintArticleBody — the inline dictionary", () => {
  it("opens as a labelled dialog and takes focus", async () => {
    const { container } = renderBody();
    const token = container.querySelector<HTMLElement>(".np-word")!;
    const term = token.textContent!;

    fireEvent.click(token);

    const panel = await screen.findByRole("dialog", { name: `${term} 사전` });
    await waitFor(() => {
      expect(document.activeElement).toBe(panel);
    });
  });

  it("closes on Escape and hands focus back to the word that opened it", async () => {
    const { container } = renderBody();
    const token = container.querySelector<HTMLElement>(".np-word")!;
    const term = token.textContent!;

    fireEvent.click(token);
    await screen.findByRole("dialog", { name: `${term} 사전` });

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(token);
  });

  it("returns focus to the word when dismissed with 닫기 too", async () => {
    const { container } = renderBody();
    const token = container.querySelector<HTMLElement>(".np-word")!;

    fireEvent.click(token);
    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(token);
  });
});
