/**
 * Regression tests for cost accounting.
 *
 * The select and extract stages both make real Sonnet calls, but their
 * provider methods used to return bare arrays — the usage came back from the
 * API and was thrown away. Every run therefore reported a cost that covered
 * the rewrite stages only, and no one could tell how far off it was.
 *
 * These lock the plumbing: if a provider reports usage, it must reach the
 * caller that records it. They deliberately do NOT assert any price — pricing
 * lives in cost.ts and changes when Anthropic's does.
 */

import { describe, expect, it } from "vitest";
import { MockLLMProvider } from "../llm/mock.js";
import type { CallUsage } from "../llm/cost.js";
import { extractFacts } from "./extract.js";
import { selectTop10 } from "./selectTop10.js";
import { clusterEvents } from "./cluster.js";
import type { EventCluster, RawItem } from "../types.js";

const USAGE: CallUsage = {
  inputTokens: 1200,
  outputTokens: 340,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 800,
};

/** A mock that additionally reports usage, the way the Anthropic provider does. */
class UsageReportingProvider extends MockLLMProvider {
  override async selectTop10(...args: Parameters<MockLLMProvider["selectTop10"]>) {
    const { selections } = await super.selectTop10(...args);
    return { selections, usage: USAGE };
  }

  override async extractFacts(...args: Parameters<MockLLMProvider["extractFacts"]>) {
    const { facts } = await super.extractFacts(...args);
    return { facts, usage: USAGE };
  }
}

function item(overrides: Partial<RawItem> = {}): RawItem {
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

function cluster(overrides: Partial<EventCluster> = {}): EventCluster {
  return {
    id: Math.random().toString(36),
    title: "Two outlets report the same event",
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

describe("select stage usage", () => {
  it("returns the rationale call's usage so the run can price it", async () => {
    const result = await selectTop10([cluster(), cluster()], new UsageReportingProvider());
    expect(result.usage).toEqual(USAGE);
  });

  it("leaves usage undefined for a provider that reports none", async () => {
    const result = await selectTop10([cluster(), cluster()], new MockLLMProvider());
    expect(result.usage).toBeUndefined();
  });
});

describe("extract stage usage", () => {
  it("returns the extraction call's usage so the run can price it", async () => {
    const result = await extractFacts(cluster(), new UsageReportingProvider());
    expect(result.usage).toEqual(USAGE);
  });

  it("leaves usage undefined for a provider that reports none", async () => {
    const result = await extractFacts(cluster(), new MockLLMProvider());
    expect(result.usage).toBeUndefined();
  });

  it("still returns the facts themselves unchanged", async () => {
    const withUsage = await extractFacts(cluster(), new UsageReportingProvider());
    const withoutUsage = await extractFacts(cluster(), new MockLLMProvider());
    expect(withUsage.facts.map((f) => f.statement)).toEqual(
      withoutUsage.facts.map((f) => f.statement),
    );
  });
});

describe("cluster boundary judgments (Haiku)", () => {
  // A genuine boundary pair: similar enough to be a candidate, not similar
  // enough for the lexical heuristic to decide on its own, so the LLM is
  // actually consulted (verified: exactly one judgeSameEvent call).
  const boundaryPair = () => [
    item({
      outlet: "AP",
      title: "Central bank holds interest rates steady this month",
      summary: "The central bank kept interest rates unchanged this month.",
    }),
    item({
      outlet: "Reuters",
      title: "Interest rates left unchanged by policymakers",
      summary: "Policymakers decided to leave borrowing costs where they were.",
    }),
  ];

  function providerReturning(sameEvent: boolean, onCall?: () => void) {
    return {
      judgeSameEvent: async () => {
        onCall?.();
        return { sameEvent, usage: USAGE };
      },
    } as unknown as MockLLMProvider;
  }

  it("honours the judgment itself, not the truthy result object", async () => {
    // The decision now arrives wrapped in an object so its usage can be
    // priced. An object is always truthy, so a caller that forgets to read
    // .sameEvent would merge every boundary pair — these two counts would
    // then be equal.
    const merged = await clusterEvents(boundaryPair(), { llm: providerReturning(true) });
    const kept = await clusterEvents(boundaryPair(), { llm: providerReturning(false) });
    expect(merged).toHaveLength(1);
    expect(kept).toHaveLength(2);
  });

  it("reports the judgment call usage so the cluster stage can be priced", async () => {
    const seen: CallUsage[] = [];
    let calls = 0;
    await clusterEvents(boundaryPair(), {
      llm: providerReturning(true, () => calls++),
      onUsage: (u) => seen.push(u),
    });
    expect(calls).toBe(1);
    expect(seen).toEqual([USAGE]);
  });

  it("reports nothing when the provider makes no call", async () => {
    const seen: CallUsage[] = [];
    await clusterEvents(boundaryPair(), { llm: new MockLLMProvider(), onUsage: (u) => seen.push(u) });
    expect(seen).toEqual([]);
  });
});
