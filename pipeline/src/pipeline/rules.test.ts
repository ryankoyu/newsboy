import { describe, expect, it } from "vitest";
import {
  extractSubjectKey,
  isCasualtyStory,
  isPoliticalStory,
  regionOf,
} from "./rules.js";
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
    countries: ["US"],
    earliestPublishedAt: null,
    latestPublishedAt: null,
    ...overrides,
  };
}

describe("isPoliticalStory", () => {
  it("flags a title with a political keyword", () => {
    const c = cluster({ title: "US congressman says he was detained by settlers" });
    expect(isPoliticalStory(c)).toBe(true);
  });

  it("flags senate/minister/parliament keywords", () => {
    expect(isPoliticalStory(cluster({ title: "Senator pushes new bill through committee" }))).toBe(true);
    expect(isPoliticalStory(cluster({ title: "Prime minister announces cabinet reshuffle" }))).toBe(true);
    expect(isPoliticalStory(cluster({ title: "Parliament votes on new budget" }))).toBe(true);
  });

  it("does not flag an unrelated tech story", () => {
    const c = cluster({
      title: "China recovered its first reusable rocket",
      items: [item({ summary: "The rocket landed safely after a test flight." })],
    });
    expect(isPoliticalStory(c)).toBe(false);
  });
});

describe("isCasualtyStory", () => {
  it("flags a title with casualty keywords", () => {
    expect(isCasualtyStory(cluster({ title: "Fire kills at least 27 people in Bangkok pub" }))).toBe(true);
    expect(isCasualtyStory(cluster({ title: "Earthquake death toll rises to 40" }))).toBe(true);
  });

  it("does not flag a neutral business story", () => {
    const c = cluster({
      title: "Exports up 54% in first 10 days of July",
      items: [item({ summary: "Strong chip shipments drove the increase." })],
    });
    expect(isCasualtyStory(c)).toBe(false);
  });
});

describe("extractSubjectKey", () => {
  it("extracts a two-word proper-noun lead subject", () => {
    expect(extractSubjectKey("Mitch McConnell reveals fall led to hospitalization")).toBe(
      "mitch mcconnell",
    );
  });

  it("extracts an institutional subject", () => {
    expect(extractSubjectKey("US Congress passes new spending bill")).toBe("us congress");
  });

  it("returns null when there is no leading capitalized run", () => {
    expect(extractSubjectKey("exports rise sharply amid strong demand")).toBeNull();
  });
});

describe("regionOf", () => {
  it("maps known countries to regions", () => {
    expect(regionOf("US")).toBe("americas");
    expect(regionOf("KR")).toBe("asia");
    expect(regionOf("GB")).toBe("europe");
    expect(regionOf("QA")).toBe("middle-east");
  });

  it("falls back to 'other' for unknown codes", () => {
    expect(regionOf("ZZ")).toBe("other");
  });
});
