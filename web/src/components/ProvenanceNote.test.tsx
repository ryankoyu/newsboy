import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ProvenanceNote } from "@/components/ProvenanceNote";
import type { Source } from "@/lib/types";

/**
 * The outlet list is gone from the reader, so this sentence is the whole of
 * what a reader is told about where the facts came from — and they have no
 * way to check it. That makes "is it true on THIS article" the only thing
 * worth testing.
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

  it("stays silent on a single-outlet article", () => {
    // The 2026-07-13 edition published one: the same Korea Herald article
    // arriving through two of its category feeds.
    const { container } = render(
      <ProvenanceNote
        sources={[
          source("https://www.koreaherald.com/article/1", "Korea Herald (Sports)"),
          source("https://www.koreaherald.com/article/1", "Korea Herald (Life & Culture)"),
        ]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not count Google News as a second newsroom", () => {
    // Two of the four articles published on 2026-08-12 were one outlet plus
    // an aggregator link to it, and read as doubly sourced.
    const { container } = render(
      <ProvenanceNote
        sources={[
          source("https://asia.nikkei.com/x", "Nikkei Asia"),
          source("https://news.google.com/rss/articles/abc", "Google News (Economy)"),
        ]}
      />
    );
    expect(container).toBeEmptyDOMElement();
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

  it("stays silent when there are no sources at all", () => {
    const { container } = render(<ProvenanceNote sources={[]} />);
    expect(container).toBeEmptyDOMElement();
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
