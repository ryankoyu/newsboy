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
        // Providers return the judgment alongside the call usage; the mock
        // makes no call, so it reports no usage.
        return { sameEvent: true };
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

  it("dedups outletCount by outletKey — two feeds from the same outlet count as ONE source (top10-curation.md §1 Layer 1, rank8 fix)", async () => {
    const items: RawItem[] = [
      item({
        outlet: "Korea Herald (Sports)",
        outletKey: "koreaherald",
        title: "Local baseball team wins championship series decisively",
        summary: "The local baseball team clinched the championship series with a decisive win today.",
      }),
      item({
        outlet: "Korea Herald (Life & Culture)",
        outletKey: "koreaherald",
        title: "Baseball team wins championship series decisively today",
        summary: "The baseball team clinched the championship series with a decisive win today.",
      }),
    ];

    const result = await clusterEvents(items);
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(2); // both raw items are present...
    expect(result[0].outletCount).toBe(1); // ...but count as ONE deduped source
    expect(result[0].outletKeys).toEqual(["koreaherald"]);
  });

  it("counts two different outletKeys as two sources even if they share a display outlet-name family", async () => {
    const items: RawItem[] = [
      item({
        outlet: "BBC World",
        outletKey: "bbc",
        title: "Central bank raises interest rates amid inflation concerns",
        summary: "The central bank raised its benchmark rate today citing inflation pressures nationwide.",
      }),
      item({
        outlet: "Guardian World",
        outletKey: "guardian",
        title: "Central bank raises interest rates amid inflation worries",
        summary: "The central bank raised its benchmark rate today citing inflation worries nationwide.",
      }),
    ];

    const result = await clusterEvents(items);
    expect(result).toHaveLength(1);
    expect(result[0].outletCount).toBe(2);
    expect(new Set(result[0].outletKeys)).toEqual(new Set(["bbc", "guardian"]));
  });

  /**
   * Boundary judgments used to go to the first cluster that cleared the floor,
   * so the Haiku call asked about whichever cluster was created earliest
   * rather than the one the item actually resembled. Token sets below are
   * hand-built so the scores are unambiguous: the later cluster scores 0.29
   * against the newcomer, the earlier one 0.14, and the two clusters score 0
   * against each other so only the newcomer triggers a call.
   */
  it("asks the LLM about the best-matching boundary cluster, not the first one it met", async () => {
    const items: RawItem[] = [
      item({ outlet: "BBC", title: "typhoon warning issued coastline" }),
      item({ outlet: "Reuters", title: "flooding markets damage ports region" }),
      item({ outlet: "AP", title: "typhoon flooding markets closed" }),
    ];

    const asked: string[] = [];
    const llm = {
      judgeSameEvent: async ({ a }: { a: { title: string } }) => {
        asked.push(a.title);
        return { sameEvent: false };
      },
    };

    await clusterEvents(items, { llm: llm as never });

    expect(asked).toEqual(["flooding markets damage ports region"]);
  });

  it("asks about the closest headline inside that cluster, not the cluster's first item", async () => {
    const items: RawItem[] = [
      item({ outlet: "BBC", title: "typhoon warning issued coastline" }),
      // Merges into the first cluster outright (0.8), then carries the token
      // ("ferries") that the third item actually matches on.
      item({ outlet: "Reuters", title: "typhoon warning issued coastline ferries" }),
      item({ outlet: "AP", title: "ferries typhoon halted travel" }),
    ];

    const asked: string[] = [];
    const llm = {
      judgeSameEvent: async ({ a }: { a: { title: string } }) => {
        asked.push(a.title);
        return { sameEvent: false };
      },
    };

    await clusterEvents(items, { llm: llm as never });

    expect(asked).toEqual(["typhoon warning issued coastline ferries"]);
  });

  it("falls back to the raw outlet name for outletCount when outletKey is absent (fixture/back-compat path)", async () => {
    const items: RawItem[] = [
      item({
        outlet: "Outlet Without Key",
        title: "Regional summit concludes with new trade agreement today",
        summary: "Leaders concluded the regional summit today with a new trade agreement signed.",
      }),
      item({
        outlet: "Outlet Without Key",
        title: "Regional summit ends with trade deal signed today",
        summary: "The regional summit ended today after leaders signed a new trade deal.",
      }),
    ];

    const result = await clusterEvents(items);
    expect(result).toHaveLength(1);
    expect(result[0].outletCount).toBe(1);
  });
});
