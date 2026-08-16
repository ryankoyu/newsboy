/**
 * Tests for the 2026-08-16 inflated source count fix at its earliest point.
 *
 * enforceTwoSourceRule is where a fact is first marked load-bearing, and
 * everything downstream — the rewrite budget (replaceLowUsableFacts), the
 * final gate, the reader's notice — inherits that decision. Counting outlet
 * names here is what let a single newsroom's story reach publication twice
 * on 2026-08-12.
 */

import { describe, expect, it } from "vitest";
import { extractFacts, usableFactCount } from "./extract.js";
import type { EventCluster, ExtractedFact, RawItem } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";

function item(outlet: string, outletKey: string): RawItem {
  return {
    outlet,
    outletKey,
    url: `https://example.com/${outletKey}`,
    title: "Untitled",
    summary: "Some summary text describing the event in reasonable detail here.",
    publishedAt: "2026-08-12T06:00:00.000Z",
    category: "business",
    guid: `${outletKey}-1`,
  };
}

function event(items: RawItem[]): EventCluster {
  return {
    id: "e1",
    title: "An event",
    category: "business",
    items,
    outletCount: items.length,
    outletKeys: items.map((i) => i.outletKey ?? i.outlet),
    countries: ["JP"],
    earliestPublishedAt: "2026-08-12T06:00:00.000Z",
    latestPublishedAt: "2026-08-12T06:00:00.000Z",
  };
}

/**
 * Returns exactly the facts it was built with, so a test says what the model
 * claimed and the assertions describe what the rule did about it.
 */
function llmClaiming(confirmedByOutlets: string[]): LLMProvider {
  const fact = (statement: string): ExtractedFact => ({
    statement,
    confirmedByOutlets,
    // What the model asserts about its own sourcing is never trusted: both
    // fields are recomputed. Deliberately optimistic here.
    sourceCount: confirmedByOutlets.length,
    usedInText: true,
    searchSummaryOnly: false,
  });
  return {
    extractFacts: async () => ({ facts: [fact("A"), fact("B"), fact("C")] }),
  } as unknown as LLMProvider;
}

describe("extractFacts — 2-source enforcement", () => {
  it("does not let an aggregator be the second source", async () => {
    const items = [
      item("Nikkei Asia", "nikkei"),
      item("Google News (Economy)", "google-news"),
    ];
    const result = await extractFacts(
      event(items),
      llmClaiming(["Nikkei Asia", "Google News (Economy)"]),
    );

    expect(result.facts.map((f) => f.sourceCount)).toEqual([1, 1, 1]);
    expect(usableFactCount(result.facts)).toBe(0);
    expect(result.facts[0].note).toMatch(/single source/);
  });

  it("does not let one outlet's two feeds be two sources", async () => {
    const items = [
      item("Korea Herald (Sports)", "koreaherald"),
      item("Korea Herald (Life & Culture)", "koreaherald"),
    ];
    const result = await extractFacts(
      event(items),
      llmClaiming(["Korea Herald (Sports)", "Korea Herald (Life & Culture)"]),
    );

    expect(usableFactCount(result.facts)).toBe(0);
  });

  it("keeps facts two real newsrooms confirm, aggregator link and all", async () => {
    const items = [
      item("Nikkei Asia", "nikkei"),
      item("Yonhap English", "yonhap"),
      item("Google News (Economy)", "google-news"),
    ];
    const result = await extractFacts(
      event(items),
      llmClaiming(["Nikkei Asia", "Yonhap English", "Google News (Economy)"]),
    );

    expect(result.facts.map((f) => f.sourceCount)).toEqual([2, 2, 2]);
    expect(usableFactCount(result.facts)).toBe(3);
  });

  it("overwrites the model's own sourceCount rather than trusting it", async () => {
    const items = [item("Nikkei Asia", "nikkei"), item("Google News (AI)", "google-news")];
    const result = await extractFacts(
      event(items),
      llmClaiming(["Nikkei Asia", "Google News (AI)"]),
    );

    // The stub claimed 2. The only number that survives is the one this
    // module counted.
    expect(result.facts.every((f) => f.sourceCount === 1)).toBe(true);
  });
});
