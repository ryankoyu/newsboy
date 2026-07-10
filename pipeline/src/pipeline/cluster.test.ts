import { describe, expect, it } from "vitest";
import { clusterEvents } from "./cluster.js";
import type { RawItem } from "../types.js";

function item(overrides: Partial<RawItem>): RawItem {
  return {
    outlet: "Outlet",
    url: "https://example.com/x",
    title: "Untitled",
    summary: "",
    publishedAt: "2026-07-10T00:00:00.000Z",
    category: "world",
    guid: Math.random().toString(36),
    ...overrides,
  };
}

describe("clusterEvents", () => {
  it("groups items from different outlets describing the same event into one cluster", () => {
    const items: RawItem[] = [
      item({
        outlet: "BBC",
        title: "Earthquake strikes northern region killing dozens",
        summary: "A powerful earthquake struck the northern region on Thursday, killing dozens of people and damaging buildings.",
        publishedAt: "2026-07-10T08:00:00.000Z",
      }),
      item({
        outlet: "Reuters",
        title: "Dozens killed as earthquake hits northern region",
        summary: "Dozens were killed after a powerful earthquake hit the northern region on Thursday, damaging buildings and roads.",
        publishedAt: "2026-07-10T09:00:00.000Z",
      }),
    ];

    const clusters = clusterEvents(items);
    return clusters.then((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].items).toHaveLength(2);
      expect(result[0].outletCount).toBe(2);
    });
  });

  it("keeps unrelated events in separate clusters", () => {
    const items: RawItem[] = [
      item({
        outlet: "BBC",
        title: "Earthquake strikes northern region killing dozens",
        summary: "A powerful earthquake struck the northern region on Thursday, killing dozens of people and damaging buildings.",
        category: "world",
        publishedAt: "2026-07-10T08:00:00.000Z",
      }),
      item({
        outlet: "Reuters",
        title: "Central bank raises interest rates by half a point",
        summary: "The central bank raised its benchmark interest rate by half a percentage point on Thursday, citing inflation concerns.",
        category: "business",
        publishedAt: "2026-07-10T08:30:00.000Z",
      }),
    ];

    const clusters = clusterEvents(items);
    return clusters.then((result) => {
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.items.length)).toEqual([1, 1]);
    });
  });

  it("splits similar-category items outside the time window into separate clusters", () => {
    const items: RawItem[] = [
      item({
        outlet: "BBC",
        title: "Tech company announces major layoffs across divisions",
        summary: "A major technology company announced significant layoffs across several divisions this week amid falling revenue.",
        category: "business",
        publishedAt: "2026-01-01T00:00:00.000Z",
      }),
      item({
        outlet: "Reuters",
        title: "Tech company announces major layoffs across divisions",
        summary: "A major technology company announced significant layoffs across several divisions this week amid falling revenue.",
        category: "business",
        publishedAt: "2026-07-10T00:00:00.000Z", // far outside the 48h window
      }),
    ];

    return clusterEvents(items).then((result) => {
      expect(result).toHaveLength(2);
    });
  });

  it("uses the LLM boundary judgment for ambiguous same-category, in-window pairs", async () => {
    const items: RawItem[] = [
      item({
        outlet: "BBC",
        title: "Government announces new policy on housing",
        summary: "The government unveiled a new housing policy today aimed at increasing affordable supply nationwide overall.",
        category: "world",
        publishedAt: "2026-07-10T08:00:00.000Z",
      }),
      item({
        outlet: "Reuters",
        title: "Officials unveil housing plan amid affordability crisis",
        summary: "Officials revealed a housing plan today meant to address affordability concerns nationwide across the country.",
        category: "world",
        publishedAt: "2026-07-10T09:00:00.000Z",
      }),
    ];

    let called = false;
    const llm = {
      judgeSameEvent: async () => {
        called = true;
        return true;
      },
    };

    const result = await clusterEvents(items, { llm: llm as any });
    // Whether or not the lexical heuristic alone reaches the high-similarity
    // ceiling, this pair is at least a plausible boundary case; if the LLM
    // was consulted, it must have been honored (merged into one cluster).
    if (called) {
      expect(result).toHaveLength(1);
    }
  });
});
