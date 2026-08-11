import { describe, expect, it } from "vitest";
import { computeLeadScore, statedCasualtyCount } from "./leadScore.js";
import { isCasualtyStory } from "./rules.js";
import type { EventCluster, RawItem } from "../types.js";

const NOW = new Date("2026-07-13T12:00:00.000Z");

function item(title: string, summary = title): RawItem {
  return {
    outlet: "Outlet",
    url: "https://example.com/" + Math.random(),
    title,
    summary,
    publishedAt: NOW.toISOString(),
    category: "world",
    guid: Math.random().toString(36),
  };
}

function cluster(overrides: Partial<EventCluster> & { title: string }): EventCluster {
  return {
    id: Math.random().toString(36),
    category: "world",
    items: [item(overrides.title)],
    outletCount: 3,
    outletKeys: ["a", "b", "c"],
    countries: ["US", "GB", "FR"],
    earliestPublishedAt: NOW.toISOString(),
    latestPublishedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("casualty keyword matching", () => {
  // Both of these were wrong before: the list had dies/died/death but not the
  // bare plural verb, and wildfire but not fire, so the deadliest story in the
  // 2026-07-13 edition was not flagged at all.
  it("flags a story that says N die", () => {
    expect(isCasualtyStory(cluster({ title: "Bangkok bar fire: 27 die, mourners gather" }))).toBe(
      true,
    );
  });

  it("does not flag a wargame exercise on the word 'wartime'", () => {
    // Substring matching fired "war" on "wartime" and put a tabletop exercise
    // in the casualty bucket.
    expect(
      isCasualtyStory(cluster({ title: "Allies hold first tabletop exercise against wartime risk" })),
    ).toBe(false);
  });

  it("does not flag on 'warning'", () => {
    expect(isCasualtyStory(cluster({ title: "Regulator issues a warning to the company" }))).toBe(
      false,
    );
  });
});

describe("stated casualty count", () => {
  it("reads a toll written before the verb", () => {
    expect(statedCasualtyCount(cluster({ title: "Fire kills dozens as 27 die in a Bangkok pub" }))).toBe(
      27,
    );
  });

  it("reads a toll written after the verb", () => {
    expect(statedCasualtyCount(cluster({ title: "Blaze kills at least 41 people" }))).toBe(41);
  });

  it("reads a toll with words between the number and the term", () => {
    expect(statedCasualtyCount(cluster({ title: "At least 12 people were killed" }))).toBe(12);
  });

  it("returns 0 when no figure is stated rather than guessing one", () => {
    expect(statedCasualtyCount(cluster({ title: "Senator dies after a short illness" }))).toBe(0);
  });

  it("ignores year-sized numbers", () => {
    expect(
      statedCasualtyCount(cluster({ title: "Anniversary of the 1923 earthquake that killed many" })),
    ).toBe(0);
  });
});

describe("lead score", () => {
  it("ranks a larger toll above a smaller one, all else equal", () => {
    const many = computeLeadScore(cluster({ title: "Fire kills at least 27 people" }), NOW);
    const one = computeLeadScore(cluster({ title: "One sailor found dead at sea" }), NOW);
    expect(many.total).toBeGreaterThan(one.total);
  });

  it("keeps separating stories past the old diversity caps", () => {
    // score.ts caps outlets at 6, so 7 and 15 were identical there — which is
    // how four stories ended up tied and ordered by publication minute.
    const wide = computeLeadScore(
      cluster({ title: "Talks open", outletCount: 15, countries: ["US", "GB", "FR", "DE", "JP"] }),
      NOW,
    );
    const narrow = computeLeadScore(
      cluster({ title: "Talks open", outletCount: 7, countries: ["US", "GB", "FR", "DE"] }),
      NOW,
    );
    expect(wide.total).toBeGreaterThan(narrow.total);
  });

  it("does not let freshness decide between differently-sized stories", () => {
    const bigOld = computeLeadScore(
      cluster({
        title: "Quake kills 300",
        outletCount: 12,
        latestPublishedAt: new Date(NOW.getTime() - 12 * 3_600_000).toISOString(),
      }),
      NOW,
    );
    const smallFresh = computeLeadScore(cluster({ title: "Minister opens a bridge" }), NOW);
    expect(bigOld.total).toBeGreaterThan(smallFresh.total);
  });

  it("bars a single-outlet story from the front page", () => {
    const s = computeLeadScore(
      cluster({ title: "Sole report of an incident", outletCount: 1, outletKeys: ["a"] }),
      NOW,
    );
    expect(s.disqualifiedBecause).toBe("single outlet");
    expect(s.total).toBe(0);
  });

  it("bars one country's internal legislative business", () => {
    const s = computeLeadScore(
      cluster({
        title: "Senator files a procedural motion in Congress",
        countries: ["US"],
      }),
      NOW,
    );
    expect(s.disqualifiedBecause).toBe("single-country internal politics");
    expect(s.total).toBe(0);
  });

  it("does not bar a political story that crossed borders", () => {
    const s = computeLeadScore(
      cluster({ title: "Parliament votes on the treaty", countries: ["FR", "DE", "GB"] }),
      NOW,
    );
    expect(s.disqualifiedBecause).toBeUndefined();
    expect(s.total).toBeGreaterThan(0);
  });
});

describe("korea relevance amplifies rather than creates", () => {
  // The failure this encodes: as a flat +2.5 bonus, Korea relevance was the
  // largest single term, so a 3-outlet Korean item with no stated stakes led
  // the front page over a fire that killed 27 across 7 outlets in 6 countries.
  const majorEvent = () =>
    cluster({
      title: "Fire kills at least 27 people at a pub",
      outletCount: 7,
      outletKeys: ["a", "b", "c", "d", "e", "f", "g"],
      countries: ["TH", "US", "GB", "FR", "DE", "JP"],
    });

  const thinKoreanItem = () =>
    cluster({
      title: "Official to attend a ceremony next week",
      outletCount: 3,
      outletKeys: ["a", "b", "c"],
      countries: ["KR", "US", "GB"],
    });

  it("does not let a thin Korean item outrank a major world event", () => {
    expect(computeLeadScore(majorEvent(), NOW).total).toBeGreaterThan(
      computeLeadScore(thinKoreanItem(), NOW).total,
    );
  });

  it("still favours the Korean story when the two are otherwise comparable", () => {
    const withKr = cluster({ title: "Talks conclude", countries: ["KR", "US", "GB"] });
    const withoutKr = cluster({ title: "Talks conclude", countries: ["FR", "US", "GB"] });
    expect(computeLeadScore(withKr, NOW).total).toBeGreaterThan(
      computeLeadScore(withoutKr, NOW).total,
    );
  });
});
