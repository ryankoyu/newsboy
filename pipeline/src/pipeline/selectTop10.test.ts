import { describe, expect, it } from "vitest";
import { selectTop10 } from "./selectTop10.js";
import { clusterEvents } from "./cluster.js";
import { MockLLMProvider } from "../llm/mock.js";
import type { CategorySlug, EventCluster, RawItem } from "../types.js";

const llm = new MockLLMProvider();

function item(overrides: Partial<RawItem>): RawItem {
  return {
    outlet: "Outlet",
    url: "https://example.com/x",
    title: "Untitled",
    summary: "Some summary text describing the event in reasonable detail here.",
    publishedAt: "2026-07-13T06:00:00.000Z",
    category: "world",
    guid: Math.random().toString(36),
    ...overrides,
  };
}

/** Build a 2-outlet (2 distinct outletKey) cluster directly, bypassing clusterEvents. */
function cluster(overrides: Partial<EventCluster>): EventCluster {
  return {
    id: Math.random().toString(36),
    title: "Untitled event",
    category: "world",
    items: [
      item({ outlet: "Outlet A", outletKey: "outlet-a" }),
      item({ outlet: "Outlet B", outletKey: "outlet-b" }),
    ],
    outletCount: 2,
    outletKeys: ["outlet-a", "outlet-b"],
    countries: ["US"],
    earliestPublishedAt: "2026-07-13T06:00:00.000Z",
    latestPublishedAt: "2026-07-13T06:00:00.000Z",
    ...overrides,
  };
}

const ROTATING_COUNTRIES = ["US", "GB", "DE", "FR", "JP", "AU"];

/**
 * Convenience: many distinct clusters for a category. Countries rotate by
 * default (unless overridden via `extra.countries`) so tests that aren't
 * specifically exercising the same-country cap don't accidentally trip it —
 * a real day's candidate pool is not all-one-country either.
 */
function manyClusters(
  category: CategorySlug,
  count: number,
  titlePrefix: string,
  extra: Partial<EventCluster> = {},
): EventCluster[] {
  return Array.from({ length: count }, (_, i) =>
    cluster({
      id: `${category}-${i}`,
      // Lowercase lead-in deliberately: extractSubjectKey only matches a
      // capitalized-word run, and every synthetic title sharing the same
      // titlePrefix would otherwise look like the same "subject" and get
      // deduped against each other — a fixture artifact, not the behavior
      // under test in these quota/backfill tests.
      title: `report on ${titlePrefix.toLowerCase()} event number ${i} unfolds today`,
      category,
      countries: extra.countries ?? [ROTATING_COUNTRIES[i % ROTATING_COUNTRIES.length]],
      ...extra,
    }),
  );
}

describe("selectTop10 — source dedup gate (outletKey, not raw outlet)", () => {
  it("treats two feeds from the same outletKey as ONE source, so a cluster fed only by them is held back", async () => {
    const items: RawItem[] = [
      item({
        outlet: "Korea Herald (Sports)",
        outletKey: "koreaherald",
        title: "Local team wins championship match today",
        summary: "The local team secured a decisive win in the championship final match today.",
      }),
      item({
        outlet: "Korea Herald (Life & Culture)",
        outletKey: "koreaherald",
        title: "Local team wins championship match today",
        summary: "The local team secured a decisive win in the championship final match today.",
      }),
    ];
    const clusters = await clusterEvents(items, { llm });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].outletCount).toBe(1); // same outletKey = 1 source, not 2

    const result = await selectTop10(clusters, llm);
    expect(result.selected).toHaveLength(0);
    expect(result.heldBack).toHaveLength(1);
  });

  it("counts two DIFFERENT outletKeys as two sources and admits the cluster as a candidate", async () => {
    const items: RawItem[] = [
      item({
        outlet: "BBC World",
        outletKey: "bbc",
        title: "Regional summit concludes with new trade agreement",
        summary: "Leaders concluded the regional summit today with a new trade agreement signed.",
      }),
      item({
        outlet: "Guardian World",
        outletKey: "guardian",
        title: "Regional summit ends with trade deal signed",
        summary: "The regional summit ended today after leaders signed a new trade deal.",
      }),
    ];
    const clusters = await clusterEvents(items, { llm });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].outletCount).toBe(2);
  });
});

describe("selectTop10 — category quota enforcement", () => {
  it("selects exactly the fixed quota per category when enough candidates exist everywhere", async () => {
    const clusters: EventCluster[] = [
      ...manyClusters("world", 6, "World"),
      ...manyClusters("korea", 6, "Korea"),
      ...manyClusters("ai-tech", 6, "AI"),
      ...manyClusters("business", 6, "Biz"),
      ...manyClusters("culture-sports", 6, "Culture"),
    ];

    const result = await selectTop10(clusters, llm);
    expect(result.selected).toHaveLength(10);

    const counts: Record<string, number> = {};
    for (const s of result.selected) counts[s.category] = (counts[s.category] ?? 0) + 1;
    expect(counts.world).toBe(3);
    expect(counts.korea).toBe(2);
    expect(counts["ai-tech"]).toBe(2);
    expect(counts.business).toBe(2);
    expect(counts["culture-sports"]).toBe(1);
  });

  it("does NOT let world crowd out other categories even when world has far more candidates (regression: rank1-3 US-politics skew)", async () => {
    const clusters: EventCluster[] = [
      ...manyClusters("world", 20, "World"),
      ...manyClusters("korea", 2, "Korea"),
      ...manyClusters("ai-tech", 2, "AI"),
      ...manyClusters("business", 2, "Biz"),
      ...manyClusters("culture-sports", 1, "Culture"),
    ];

    const result = await selectTop10(clusters, llm);
    const worldCount = result.selected.filter((s) => s.category === "world").length;
    expect(worldCount).toBe(3);
  });

  it("logs a backfill when a category has too few candidates, and fills from an adjacent category", async () => {
    const clusters: EventCluster[] = [
      ...manyClusters("world", 10, "World"),
      // korea has only 1 candidate but quota is 2 -> must backfill 1 slot
      ...manyClusters("korea", 1, "Korea"),
      ...manyClusters("ai-tech", 6, "AI"),
      ...manyClusters("business", 6, "Biz"),
      ...manyClusters("culture-sports", 6, "Culture"),
    ];

    const result = await selectTop10(clusters, llm);
    expect(result.selected).toHaveLength(10);
    expect(result.report.backfills.length).toBeGreaterThan(0);
    const koreaBackfill = result.report.backfills.find((b) => b.category === "korea");
    expect(koreaBackfill).toBeDefined();
    expect(koreaBackfill!.filledFrom).not.toBeNull();
    // Adjacency list for korea is ["world", "business"] — must not be culture-sports/ai-tech.
    expect(["world", "business"]).toContain(koreaBackfill!.filledFrom);
  });
});

describe("selectTop10 — same-country political story cap", () => {
  it("caps same-country political stories at 2, even when more are the highest-scoring candidates", async () => {
    const politicalTitles = [
      "US congressman says he was detained by soldiers",
      "Senator faces new investigation over campaign finance",
      "Congress passes controversial spending bill after vote",
      "Prime minister announces surprise cabinet reshuffle today",
    ];
    const clusters: EventCluster[] = [
      ...politicalTitles.map((title, i) =>
        cluster({
          id: `pol-${i}`,
          title,
          category: "world",
          countries: ["US"],
          outletCount: 5, // score high so they'd otherwise all be picked
          outletKeys: ["a", "b", "c", "d", "e"],
        }),
      ),
      ...manyClusters("world", 5, "Neutral world"),
      ...manyClusters("korea", 3, "Korea"),
      ...manyClusters("ai-tech", 3, "AI"),
      ...manyClusters("business", 3, "Biz"),
      ...manyClusters("culture-sports", 3, "Culture"),
    ];

    const result = await selectTop10(clusters, llm);
    const usPoliticalSelected = result.selected.filter(
      (s) => politicalTitles.includes(s.title),
    );
    expect(usPoliticalSelected.length).toBeLessThanOrEqual(2);
  });
});

describe("selectTop10 — tone balance (casualty cap + non-casualty last slot)", () => {
  it("caps casualty-tagged stories overall and ends with the last slot as non-casualty", async () => {
    const casualtyTitles = Array.from(
      { length: 8 },
      (_, i) => `Deadly attack kills dozens in incident number ${i}`,
    );
    const casualtyCountries = ["FR", "IN", "BR", "TH", "EG", "PH", "MX", "ID"];
    const clusters: EventCluster[] = [
      ...casualtyTitles.map((title, i) =>
        cluster({
          id: `cas-${i}`,
          title,
          category: "world",
          countries: [casualtyCountries[i]],
          outletCount: 6,
          outletKeys: ["a", "b", "c", "d", "e", "f"],
        }),
      ),
      ...manyClusters("world", 5, "Calm world story"),
      ...manyClusters("korea", 3, "Korea"),
      ...manyClusters("ai-tech", 3, "AI"),
      ...manyClusters("business", 3, "Biz"),
      ...manyClusters("culture-sports", 3, "Culture"),
    ];

    const result = await selectTop10(clusters, llm);
    expect(result.selected).toHaveLength(10);

    const casualtyCount = result.selected.filter((s) =>
      casualtyTitles.includes(s.title),
    ).length;
    expect(casualtyCount).toBeLessThanOrEqual(5);

    const last = result.selected[result.selected.length - 1];
    expect(casualtyTitles.includes(last.title)).toBe(false);
  });
});

describe("selectTop10 — selection report", () => {
  it("records an outcome for every candidate and a finalOrder matching the selected ranks", async () => {
    const clusters: EventCluster[] = [
      ...manyClusters("world", 5, "World"),
      ...manyClusters("korea", 3, "Korea"),
      ...manyClusters("ai-tech", 3, "AI"),
      ...manyClusters("business", 3, "Biz"),
      ...manyClusters("culture-sports", 2, "Culture"),
    ];

    const result = await selectTop10(clusters, llm);
    expect(result.report.candidates.length).toBe(clusters.length);
    expect(result.report.finalOrder.length).toBe(result.selected.length);
    for (const s of result.selected) {
      expect(result.report.finalOrder[s.rankInEdition - 1]).toBe(s.id);
    }
    // Every non-selected candidate has an outcome other than "selected"/"backfilled".
    const selectedIds = new Set(result.selected.map((s) => s.id));
    for (const c of result.report.candidates) {
      if (!selectedIds.has(c.id)) {
        expect(["rejected", "held_back_two_source"]).toContain(c.outcome);
      }
    }
  });
});
