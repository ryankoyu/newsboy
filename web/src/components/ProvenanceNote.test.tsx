import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProvenanceNote } from "@/components/ProvenanceNote";
import type { Source } from "@/lib/types";

/**
 * The outlet list is gone from the reader, so this note is the whole of what
 * a reader is told about how the article came to exist — and they have no way
 * to check any of it. Two things are therefore worth testing: that the
 * sourcing claim is true on THIS article, and that the AI disclosure appears
 * on every article, including the ones the sourcing claim skips.
 */

const source = (url: string, outlet: string): Source => ({
  id: url,
  article_id: "a1",
  url,
  outlet,
  title: null,
  fetched_at: "2026-08-13T00:00:00Z",
  fetch_method: "rss_summary",
  created_at: "2026-08-13T00:00:00Z",
});

afterEach(cleanup);

describe("ProvenanceNote", () => {
  it("appears when two real newsrooms reported the story", () => {
    render(
      <ProvenanceNote
        sources={[
          source("https://www.bbc.com/news/1", "BBC World"),
          source("https://www.theguardian.com/x", "The Guardian"),
        ]}
      />
    );
    expect(screen.getByText(/교차 확인한 사실만으로/)).toBeInTheDocument();
  });

  it("makes no cross-check claim on a single-outlet article", () => {
    // The 2026-07-13 edition published one: the same Korea Herald article
    // arriving through two of its category feeds.
    render(
      <ProvenanceNote
        sources={[
          source("https://www.koreaherald.com/article/1", "Korea Herald (Sports)"),
          source("https://www.koreaherald.com/article/1", "Korea Herald (Life & Culture)"),
        ]}
      />
    );
    expect(screen.queryByText(/교차 확인/)).not.toBeInTheDocument();
  });

  it("does not count Google News as a second newsroom", () => {
    // Two of the four articles published on 2026-08-12 were one outlet plus
    // an aggregator link to it, and read as doubly sourced.
    render(
      <ProvenanceNote
        sources={[
          source("https://asia.nikkei.com/x", "Nikkei Asia"),
          source("https://news.google.com/rss/articles/abc", "Google News (Economy)"),
        ]}
      />
    );
    expect(screen.queryByText(/교차 확인/)).not.toBeInTheDocument();
  });

  it("counts a real second outlet even when an aggregator is also present", () => {
    render(
      <ProvenanceNote
        sources={[
          source("https://asia.nikkei.com/x", "Nikkei Asia"),
          source("https://en.yna.co.kr/y", "Yonhap"),
          source("https://news.google.com/rss/articles/abc", "Google News"),
        ]}
      />
    );
    expect(screen.getByText(/교차 확인한 사실만으로/)).toBeInTheDocument();
  });

  it("makes no cross-check claim when there are no sources at all", () => {
    render(<ProvenanceNote sources={[]} />);
    expect(screen.queryByText(/교차 확인/)).not.toBeInTheDocument();
  });

  // --- The disclosure, which is not conditional on anything ---

  it("says a model wrote it and a person approved it — on a well-sourced article", () => {
    render(
      <ProvenanceNote
        sources={[
          source("https://www.bbc.com/news/1", "BBC World"),
          source("https://www.theguardian.com/x", "The Guardian"),
        ]}
      />
    );
    expect(screen.getByText(/AI가 새로 썼고, 사람이 검수한 뒤 발행/)).toBeInTheDocument();
  });

  it("says it on a thinly-sourced article too — the one that needs it most", () => {
    render(
      <ProvenanceNote
        sources={[source("https://asia.nikkei.com/x", "Nikkei Asia")]}
      />
    );
    expect(screen.getByText(/AI가 새로 썼고, 사람이 검수한 뒤 발행/)).toBeInTheDocument();
    expect(screen.queryByText(/교차 확인/)).not.toBeInTheDocument();
  });

  it("says it even when the article has no sources recorded at all", () => {
    render(<ProvenanceNote sources={[]} />);
    expect(screen.getByText(/AI가 새로 썼고, 사람이 검수한 뒤 발행/)).toBeInTheDocument();
  });

  it("names no outlet — attribution was removed on purpose", () => {
    render(
      <ProvenanceNote
        sources={[
          source("https://www.bbc.com/news/1", "BBC World"),
          source("https://www.theguardian.com/x", "The Guardian"),
        ]}
      />
    );
    expect(screen.queryByText(/BBC|Guardian/)).not.toBeInTheDocument();
  });
});
