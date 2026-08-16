import { describe, it, expect } from "vitest";
import type { Source } from "@/lib/types";
import { groupSourcesByOutlet } from "@/lib/sourceOutlets";

function makeSource(overrides: Partial<Source>): Source {
  return {
    id: `source-${Math.random()}`,
    article_id: "article-1",
    url: "https://example.com/a",
    outlet: "Example",
    title: "Title",
    fetched_at: "2026-07-13T00:00:00.000Z",
    fetch_method: "full_text",
    created_at: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

describe("groupSourcesByOutlet", () => {
  it("counts sources with distinct domains as distinct outlets", () => {
    const sources = [
      makeSource({ url: "https://www.bbc.co.uk/news/a", outlet: "BBC World" }),
      makeSource({ url: "https://www.aljazeera.com/news/b", outlet: "Al Jazeera" }),
    ];
    expect(groupSourcesByOutlet(sources)).toHaveLength(2);
  });

  it("de-dupes two feeds from the same outlet domain into one outlet — docs/feature-status.md G2", () => {
    // Same real-world case as the Guardian World / Guardian US-News feeds
    // on rank-1 of the 2026-07-13 edition.
    const sources = [
      makeSource({
        url: "https://www.theguardian.com/world/2026/jul/11/a",
        outlet: "The Guardian World",
      }),
      makeSource({
        url: "https://www.theguardian.com/us-news/2026/jul/12/b",
        outlet: "The Guardian World",
      }),
      makeSource({ url: "https://www.bbc.co.uk/news/c", outlet: "BBC World" }),
    ];
    expect(groupSourcesByOutlet(sources)).toHaveLength(2);

    const groups = groupSourcesByOutlet(sources);
    const guardianGroup = groups.find((g) => g.domain === "theguardian.com");
    expect(guardianGroup?.sources).toHaveLength(2);
  });

  it("ignores a leading www. when comparing domains", () => {
    const sources = [
      makeSource({ url: "https://www.koreaherald.com/article/1" }),
      makeSource({ url: "https://koreaherald.com/article/1" }),
    ];
    expect(groupSourcesByOutlet(sources)).toHaveLength(1);
  });

  it("keeps every article link even when outlets are grouped", () => {
    const sources = [
      makeSource({ url: "https://www.koreaherald.com/article/10806861", outlet: "Korea Herald (Sports)" }),
      makeSource({ url: "https://www.koreaherald.com/article/10806861", outlet: "Korea Herald (Life & Culture)" }),
    ];
    const groups = groupSourcesByOutlet(sources);
    expect(groups).toHaveLength(1);
    expect(groups[0].sources).toHaveLength(2);
  });

  it("returns 0 for an empty source list", () => {
    expect(groupSourcesByOutlet([])).toHaveLength(0);
  });
});
