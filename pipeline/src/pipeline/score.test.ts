import { describe, expect, it } from "vitest";
import { scoreCluster } from "./score.js";
import type { EventCluster, RawItem } from "../types.js";

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

function cluster(overrides: Partial<EventCluster>): EventCluster {
  return {
    id: "c1",
    title: "Untitled",
    category: "world",
    items: [item({})],
    outletCount: 2,
    outletKeys: ["a", "b"],
    countries: ["US", "GB"],
    earliestPublishedAt: null,
    latestPublishedAt: null,
    ...overrides,
  };
}

const NOW = new Date("2026-07-13T12:00:00.000Z");

describe("scoreCluster", () => {
  it("gives a higher score to a cluster with more distinct sources", () => {
    const low = scoreCluster(cluster({ outletCount: 2, outletKeys: ["a", "b"] }), NOW);
    const high = scoreCluster(
      cluster({ outletCount: 5, outletKeys: ["a", "b", "c", "d", "e"] }),
      NOW,
    );
    expect(high.total).toBeGreaterThan(low.total);
  });

  it("boosts clusters co-reported by a Korean outlet", () => {
    const withoutKr = scoreCluster(cluster({ countries: ["US", "GB"] }), NOW);
    const withKr = scoreCluster(cluster({ countries: ["US", "KR"] }), NOW);
    expect(withKr.total).toBeGreaterThan(withoutKr.total);
    expect(withKr.koreaRelevance).toBe(1);
    expect(withoutKr.koreaRelevance).toBe(0);
  });

  it("scores fresher stories higher than stale ones", () => {
    const fresh = scoreCluster(
      cluster({ latestPublishedAt: "2026-07-13T11:00:00.000Z" }),
      NOW,
    );
    const stale = scoreCluster(
      cluster({ latestPublishedAt: "2026-07-10T00:00:00.000Z" }),
      NOW,
    );
    expect(fresh.total).toBeGreaterThan(stale.total);
  });

  it("does not crash and gives a neutral freshness score when publishedAt is missing", () => {
    const result = scoreCluster(cluster({ latestPublishedAt: null }), NOW);
    expect(result.freshness).toBeGreaterThan(0);
    expect(Number.isFinite(result.total)).toBe(true);
  });

  it("rewards more distinct countries even at the same outlet count", () => {
    const oneCountry = scoreCluster(
      cluster({ outletCount: 3, outletKeys: ["a", "b", "c"], countries: ["US"] }),
      NOW,
    );
    const threeCountries = scoreCluster(
      cluster({ outletCount: 3, outletKeys: ["a", "b", "c"], countries: ["US", "GB", "KR"] }),
      NOW,
    );
    expect(threeCountries.total).toBeGreaterThan(oneCountry.total);
  });
});
