/**
 * Layer 2 external signals + Layer 3 편집회의 — top10-curation.md §1.
 *
 * The point under test is the division of authority: the LLM proposes an
 * order, the rules dispose of it, and a missing signal degrades the score
 * without breaking the run.
 */

import { describe, expect, it } from "vitest";
import { selectTop10 } from "./selectTop10.js";
import { scoreCluster } from "./score.js";
import {
  buildGdeltQuery,
  createGdeltGlobalImpactProvider,
  normalizeGlobalImpact,
} from "./globalImpact.js";
import { MockLLMProvider } from "../llm/mock.js";
import type { EventCluster, RawItem } from "../types.js";
import type { LLMProvider, Top10Candidate } from "../llm/provider.js";

function item(outlet: string, outletKey: string): RawItem {
  return {
    outlet,
    url: `https://${outletKey}.example/x`,
    title: "Untitled",
    summary: "Some summary text describing the event in reasonable detail here.",
    publishedAt: "2026-07-13T06:00:00.000Z",
    category: "world",
    guid: `${outletKey}-${Math.random()}`,
    outletKey,
  };
}

function cluster(overrides: Partial<EventCluster>): EventCluster {
  return {
    id: Math.random().toString(36),
    title: "Untitled event",
    category: "world",
    items: [item("Outlet A", "outlet-a"), item("Outlet B", "outlet-b")],
    outletCount: 2,
    outletKeys: ["outlet-a", "outlet-b"],
    countries: ["US"],
    earliestPublishedAt: "2026-07-13T06:00:00.000Z",
    latestPublishedAt: "2026-07-13T06:00:00.000Z",
    ...overrides,
  };
}

describe("score.ts external Layer 2 signals", () => {
  const c = cluster({ id: "c1" });

  it("treats an absent signal as neutral, not as a penalty", () => {
    const withoutSignals = scoreCluster(c, new Date("2026-07-13T07:00:00Z"));
    const withZeroSignals = scoreCluster(c, new Date("2026-07-13T07:00:00Z"), {
      globalImpact: 0,
      learnability: 0,
      demerit: 0,
    });
    expect(withoutSignals.total).toBeCloseTo(withZeroSignals.total, 10);
  });

  it("raises the score for global reach and learnability, lowers it for demerit", () => {
    const now = new Date("2026-07-13T07:00:00Z");
    const base = scoreCluster(c, now).total;
    expect(scoreCluster(c, now, { globalImpact: 1 }).total).toBeGreaterThan(base);
    expect(scoreCluster(c, now, { learnability: 1 }).total).toBeGreaterThan(base);
    expect(scoreCluster(c, now, { demerit: 1 }).total).toBeLessThan(base);
  });

  it("clamps out-of-range or non-numeric signals instead of trusting them", () => {
    const now = new Date("2026-07-13T07:00:00Z");
    const sane = scoreCluster(c, now, { globalImpact: 1 }).total;
    expect(scoreCluster(c, now, { globalImpact: 99 }).total).toBeCloseTo(sane, 10);
    expect(scoreCluster(c, now, { globalImpact: Number.NaN }).globalImpact).toBe(0);
  });
});

describe("globalImpact (GDELT)", () => {
  it("builds a query from the headline's distinctive words only", () => {
    const query = buildGdeltQuery("The president said that inflation pressures are rising again");
    expect(query).not.toContain("the");
    expect(query).not.toContain("said");
    expect(query.split(" ").length).toBeLessThanOrEqual(4);
    expect(query).toContain("inflation");
  });

  it("counts distinct source countries, not article volume", async () => {
    const body = JSON.stringify({
      articles: [
        { sourcecountry: "United Kingdom" },
        { sourcecountry: "United Kingdom" },
        { sourcecountry: "Japan" },
        { sourcecountry: "Germany" },
      ],
    });
    const provider = createGdeltGlobalImpactProvider({
      fetchImpl: async () => new Response(body, { status: 200 }),
      sleep: async () => {},
    });

    const signals = await provider([cluster({ id: "c1", title: "Central bank raises rates" })]);
    expect(signals.get("c1")).toEqual({ articleCount: 4, countryCount: 3 });
  });

  it("returns no signal for a rate-limited (non-JSON) response instead of failing", async () => {
    const provider = createGdeltGlobalImpactProvider({
      fetchImpl: async () =>
        new Response("Please limit requests to one every 5 seconds", { status: 200 }),
      sleep: async () => {},
    });

    const signals = await provider([cluster({ id: "c1", title: "Central bank raises rates" })]);
    expect(signals.size).toBe(0);
  });

  it("survives a thrown request and keeps scoring the rest", async () => {
    let call = 0;
    const provider = createGdeltGlobalImpactProvider({
      fetchImpl: async () => {
        call++;
        if (call === 1) throw new Error("network down");
        return new Response(JSON.stringify({ articles: [{ sourcecountry: "France" }] }), {
          status: 200,
        });
      },
      sleep: async () => {},
    });

    const signals = await provider([
      cluster({ id: "c1", title: "Central bank raises rates sharply" }),
      cluster({ id: "c2", title: "Coastal city completes flood defences" }),
    ]);
    expect(signals.has("c1")).toBe(false);
    expect(signals.get("c2")?.countryCount).toBe(1);
  });

  it("caps how many queries one run may spend on the rate-limited endpoint", async () => {
    let calls = 0;
    const provider = createGdeltGlobalImpactProvider({
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ articles: [] }), { status: 200 });
      },
      sleep: async () => {},
      maxQueries: 3,
    });

    await provider(
      Array.from({ length: 10 }, (_, i) =>
        cluster({ id: `c${i}`, title: `Distinctive headline number ${i} about something` }),
      ),
    );
    expect(calls).toBe(3);
  });

  it("normalises country reach to 0-1 with a cap", () => {
    expect(normalizeGlobalImpact(undefined)).toBe(0);
    expect(normalizeGlobalImpact({ articleCount: 200, countryCount: 100 })).toBe(1);
    expect(normalizeGlobalImpact({ articleCount: 4, countryCount: 6 })).toBeCloseTo(0.5, 5);
  });
});

/** A provider whose editorial call proposes an order we control. */
function llmProposing(order: string[]): LLMProvider {
  const mock = new MockLLMProvider();
  return {
    ...mock,
    name: "mock-editorial",
    judgeSameEvent: (i) => mock.judgeSameEvent(i),
    extractFacts: (i) => mock.extractFacts(i),
    generateAllLevels: (i) => mock.generateAllLevels(i),
    rewrite: (i) => mock.rewrite(i),
    judgeCefrBand: (i) => mock.judgeCefrBand(i),
    scoreLearnabilityAndDemerit: (i) => mock.scoreLearnabilityAndDemerit(i),
    // Deliberately unfiltered: a proposal may name an id that is not a
    // candidate, and handling that is the caller's job, not the fixture's.
    selectTop10: async (_candidates: Top10Candidate[]) => ({
      selections: order.map((id, idx) => ({
        id,
        rankInEdition: idx + 1,
        rationale: `proposed #${idx + 1}`,
      })),
    }),
  };
}

describe("Layer 3 편집회의", () => {
  /**
   * A full day's candidate pool: 15 candidates for 10 slots, with every
   * category's own quota satisfiable from its own candidates. Without more
   * candidates than slots there is nothing for a quota to enforce — the
   * cross-category backfill would simply admit everyone.
   *
   * The four world candidates carry descending outlet counts, so "alpha"
   * wins on score alone and any other winner had to come from the editorial
   * proposal.
   */
  function candidatePool(): EventCluster[] {
    const world = ["alpha", "bravo", "charlie", "delta"].map((name, i) =>
      cluster({
        id: name,
        category: "world",
        title: `regional summit ${name} concludes with joint statement`,
        outletCount: 5 - i,
        outletKeys: ["outlet-a", "outlet-b", "outlet-c", "outlet-d", "outlet-e"].slice(0, 5 - i),
        // Two countries, two regions: enough for the world-slot region-spread
        // rule to be satisfiable without it, rather than the proposal,
        // deciding the third slot.
        countries: [["US", "US", "GB", "GB"][i]],
      }),
    );
    const others = (
      [
        ["korea", 3],
        ["ai-tech", 3],
        ["business", 3],
        ["culture-sports", 2],
      ] as const
    ).flatMap(([category, count]) =>
      Array.from({ length: count }, (_, i) =>
        cluster({
          id: `${category}-${i}`,
          category,
          title: `ordinary ${category} story number ${i} with its own wording`,
          countries: [["JP", "AU", "CA"][i % 3]],
        }),
      ),
    );
    return [...world, ...others];
  }

  it("lets the LLM's proposal decide which candidates fill the quota", async () => {
    const clusters = candidatePool();
    const result = await selectTop10(clusters, llmProposing(["delta", "charlie", "bravo"]));

    const selectedIds = result.selected.map((s) => s.id);
    expect(selectedIds).toContain("delta");
    expect(selectedIds).not.toContain("alpha"); // highest score, not proposed
    expect(result.report.candidates.find((c) => c.id === "delta")?.llmProposedRank).toBe(1);
    expect(result.report.candidates.find((c) => c.id === "alpha")?.llmProposedRank).toBeNull();
  });

  it("still enforces the category quota when the LLM proposes more than it allows", async () => {
    const clusters = candidatePool();
    // The model asks for all four world stories; only three slots exist.
    const result = await selectTop10(
      clusters,
      llmProposing(["alpha", "bravo", "charlie", "delta"]),
    );

    expect(result.selected.filter((s) => s.category === "world")).toHaveLength(3);
    const overruled = result.report.candidates.find((c) => c.outcome === "rejected");
    expect(overruled?.llmProposedRank).not.toBeNull();
  });

  it("ignores a proposal naming a candidate that was never eligible", async () => {
    const clusters = candidatePool();
    const result = await selectTop10(clusters, llmProposing(["hallucinated-id", "bravo"]));

    expect(result.selected.map((s) => s.id)).not.toContain("hallucinated-id");
    expect(result.report.candidates.find((c) => c.id === "bravo")?.llmProposedRank).toBe(2);
  });

  it("falls back to score order and records the gap when the editorial call fails", async () => {
    const mock = new MockLLMProvider();
    const failing: LLMProvider = {
      ...mock,
      name: "mock-no-editorial",
      judgeSameEvent: (i) => mock.judgeSameEvent(i),
      extractFacts: (i) => mock.extractFacts(i),
      generateAllLevels: (i) => mock.generateAllLevels(i),
      rewrite: (i) => mock.rewrite(i),
      judgeCefrBand: (i) => mock.judgeCefrBand(i),
      scoreLearnabilityAndDemerit: (i) => mock.scoreLearnabilityAndDemerit(i),
      selectTop10: async () => {
        throw new Error("overloaded");
      },
    };

    const result = await selectTop10(candidatePool(), failing);

    expect(result.selected.length).toBeGreaterThan(0);
    expect(result.report.limitations.some((l) => l.includes("Layer 3"))).toBe(true);
    // Highest score leads the world slots again, exactly as before Layer 3.
    expect(result.selected.map((s) => s.id)).toContain("alpha");
  });

  it("records the missing-signal limitation when no GDELT provider is configured", async () => {
    const result = await selectTop10(candidatePool(), new MockLLMProvider());
    expect(result.report.limitations.some((l) => l.includes("GDELT"))).toBe(true);
  });

  it("scores with the GDELT signal when a provider is supplied", async () => {
    const clusters = candidatePool();
    const result = await selectTop10(clusters, new MockLLMProvider(), {
      globalImpact: async (cs) =>
        new Map(
          cs.map((c) => [c.id, { articleCount: 10, countryCount: c.id === "delta" ? 12 : 1 }]),
        ),
    });

    const delta = result.report.candidates.find((c) => c.id === "delta")!;
    const alpha = result.report.candidates.find((c) => c.id === "alpha")!;
    expect(delta.scoreBreakdown.globalImpact).toBe(1);
    expect(alpha.scoreBreakdown.globalImpact).toBeCloseTo(1 / 12, 5);
    expect(result.report.limitations.some((l) => l.includes("GDELT"))).toBe(false);
  });

  it("reports the learnability signal as missing when the provider cannot supply it", async () => {
    const mock = new MockLLMProvider();
    const noLearnability: LLMProvider = {
      name: "mock-no-learnability",
      judgeSameEvent: (i) => mock.judgeSameEvent(i),
      selectTop10: (c) => mock.selectTop10(c),
      extractFacts: (i) => mock.extractFacts(i),
      generateAllLevels: (i) => mock.generateAllLevels(i),
      rewrite: (i) => mock.rewrite(i),
      judgeCefrBand: (i) => mock.judgeCefrBand(i),
    };

    const result = await selectTop10(candidatePool(), noLearnability);
    expect(result.report.limitations.some((l) => l.includes("학습 적합성"))).toBe(true);
  });

  it("matches learnability scores by id, never by position", async () => {
    const mock = new MockLLMProvider();
    const shuffling: LLMProvider = {
      ...mock,
      name: "mock-shuffled",
      judgeSameEvent: (i) => mock.judgeSameEvent(i),
      selectTop10: (c) => mock.selectTop10(c),
      extractFacts: (i) => mock.extractFacts(i),
      generateAllLevels: (i) => mock.generateAllLevels(i),
      rewrite: (i) => mock.rewrite(i),
      judgeCefrBand: (i) => mock.judgeCefrBand(i),
      // Answers about one candidate only, and not the first one.
      scoreLearnabilityAndDemerit: async () => ({
        scores: [
          { id: "charlie", learnabilityScore: 1, demeritScore: 0, reasoning: "x" },
        ],
      }),
    };

    const result = await selectTop10(candidatePool(), shuffling);
    const charlie = result.report.candidates.find((c) => c.id === "charlie")!;
    const alpha = result.report.candidates.find((c) => c.id === "alpha")!;
    expect(charlie.scoreBreakdown.learnability).toBe(1);
    expect(alpha.scoreBreakdown.learnability).toBe(0);
  });
});
