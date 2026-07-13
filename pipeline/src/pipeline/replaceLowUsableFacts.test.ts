/**
 * Tests for the 2026-07-14 two-source bypass fix: resolveUsableEvents() must
 * block rewrite for events whose extracted facts don't clear
 * MIN_USABLE_FACTS_TO_REWRITE, and must swap in the next-best same-category
 * heldBack candidate instead — capped, with an audit log entry either way.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_REPLACEMENTS_PER_SLOT,
  MIN_USABLE_FACTS_TO_REWRITE,
  resolveUsableEvents,
} from "./replaceLowUsableFacts.js";
import { MockLLMProvider } from "../llm/mock.js";
import type { EventCluster, RawItem, SelectedEvent } from "../types.js";

const llm = new MockLLMProvider();

function item(overrides: Partial<RawItem>): RawItem {
  return {
    outlet: "Outlet",
    url: "https://example.com/x",
    title: "Untitled",
    summary: "Some summary text describing the event in reasonable detail here.",
    publishedAt: "2026-07-13T06:00:00.000Z",
    category: "business",
    guid: Math.random().toString(36),
    ...overrides,
  };
}

function cluster(overrides: Partial<EventCluster>): EventCluster {
  return {
    id: Math.random().toString(36),
    title: "Untitled event",
    category: "business",
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

function selected(overrides: Partial<SelectedEvent>): SelectedEvent {
  return {
    ...cluster({}),
    rankInEdition: 7,
    selectionRationale: "score=1.0",
    ...overrides,
  };
}

/**
 * Reproduces the 2026-07-14 incident: many RSS items that all reduce, after
 * MockLLMProvider's sentence-level dedup, to sentences confirmed by only ONE
 * outlet each (each item's summary is lexically distinct from every other
 * item's, so groupSimilarSentences never merges them into a 2+-outlet
 * group). This mirrors the real Texas-economy event: 7 raw items that were
 * really 2 distinct underlying articles (best-states / worst-states) each
 * covered by several feeds, so no single SENTENCE had 2 independent-outlet
 * corroboration even though the CLUSTER had outletCount=7.
 */
function singleSourceOnlyEvent(id: string, category: SelectedEvent["category"] = "business"): SelectedEvent {
  return selected({
    id,
    category,
    title: `Single-source event ${id}`,
    outletCount: 7,
    items: [
      item({
        outlet: "Outlet A",
        outletKey: "outlet-a",
        summary: "The economy of Alpha state ranked second nationally this year according to a new study.",
      }),
      item({
        outlet: "Outlet B",
        outletKey: "outlet-b",
        summary: "A separate list highlighted states with the weakest economic performance in the same study.",
      }),
      item({
        outlet: "Outlet C",
        outletKey: "outlet-c",
        summary: "Analysts noted the ranking methodology weighs several distinct economic indicators together.",
      }),
    ],
  });
}

/**
 * A healthy event: 2 outlets, each with 3 sentences, where every sentence is
 * lexically close enough to its counterpart in the other outlet's summary to
 * be grouped as the same fact by MockLLMProvider's groupSimilarSentences —
 * so it yields 3 distinct facts, each confirmed by 2 outlets, clearing
 * MIN_USABLE_FACTS_TO_REWRITE.
 */
function healthySummaryPair(): [string, string] {
  const a =
    "The central bank raised interest rates by half a point on Thursday citing inflation concerns across the economy. " +
    "Officials said the move was intended to slow consumer price growth over the coming months. " +
    "Markets reacted with a modest decline in major stock indexes following the announcement.";
  const b =
    "The central bank increased interest rates by half a point Thursday, pointing to inflation concerns across the economy. " +
    "Officials stated the move was meant to slow consumer price growth over the coming months. " +
    "Stock markets showed a modest decline in major indexes after the announcement was made.";
  return [a, b];
}

function healthyEvent(id: string, category: SelectedEvent["category"] = "business"): SelectedEvent {
  const [summaryA, summaryB] = healthySummaryPair();
  return selected({
    id,
    category,
    title: `Healthy event ${id}`,
    outletCount: 2,
    items: [
      item({ outlet: "Outlet A", outletKey: "outlet-a", summary: summaryA }),
      item({ outlet: "Outlet B", outletKey: "outlet-b", summary: summaryB }),
    ],
  });
}

describe("resolveUsableEvents", () => {
  it("keeps a healthy event unchanged when it clears MIN_USABLE_FACTS_TO_REWRITE", async () => {
    const event = healthyEvent("e1");
    const { resolved, log } = await resolveUsableEvents([event], [], llm);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].event.id).toBe("e1");
    expect(log).toEqual([]);
  });

  it("drops a single-source-only event and replaces it with the next same-category heldBack candidate", async () => {
    const original = singleSourceOnlyEvent("orig", "business");
    const replacement = cluster({ id: "repl", category: "business", title: "Replacement event" });
    // Make the replacement healthy (2 outlets, 3 corroborated sentences) so it resolves on first try.
    const [summaryA, summaryB] = healthySummaryPair();
    replacement.items = [
      item({ outlet: "Outlet X", outletKey: "outlet-x", summary: summaryA }),
      item({ outlet: "Outlet Y", outletKey: "outlet-y", summary: summaryB }),
    ];

    const { resolved, log, remainingHeldBack } = await resolveUsableEvents(
      [original],
      [replacement],
      llm,
    );

    expect(resolved).toHaveLength(1);
    expect(resolved[0].event.id).toBe("repl");
    // Original slot's rank is preserved on the replacement.
    expect(resolved[0].event.rankInEdition).toBe(original.rankInEdition);

    expect(log).toHaveLength(1);
    expect(log[0].droppedClusterId).toBe("orig");
    expect(log[0].replacedByClusterId).toBe("repl");
    expect(log[0].usableFactCount).toBeLessThan(MIN_USABLE_FACTS_TO_REWRITE);

    expect(remainingHeldBack).toEqual([]);
  });

  it("does not pull a replacement from a different category", async () => {
    const original = singleSourceOnlyEvent("orig", "business");
    const wrongCategoryReplacement = cluster({ id: "wrong-cat", category: "world" });

    const { resolved, log } = await resolveUsableEvents(
      [original],
      [wrongCategoryReplacement],
      llm,
    );

    // No admissible same-category replacement exists -> slot left empty.
    expect(resolved).toHaveLength(0);
    expect(log).toHaveLength(1);
    expect(log[0].replacedByClusterId).toBeNull();
    expect(log[0].reason).toMatch(/no more heldBack candidates/);
  });

  it("leaves the slot empty (never publishes) when the replacement cap is exhausted", async () => {
    const original = singleSourceOnlyEvent("orig", "business");
    // Every heldBack candidate in this pool is ALSO single-source-only, so
    // every attempt (original + up to MAX_REPLACEMENTS_PER_SLOT swaps) fails.
    const badReplacements = Array.from({ length: MAX_REPLACEMENTS_PER_SLOT + 2 }, (_, i) =>
      singleSourceOnlyEvent(`bad-${i}`, "business"),
    );

    const { resolved, log } = await resolveUsableEvents([original], badReplacements, llm);

    expect(resolved).toHaveLength(0);
    // At least one log entry records the cap/empty-slot outcome.
    expect(log.length).toBeGreaterThan(0);
    const last = log[log.length - 1];
    expect(last.replacedByClusterId).toBeNull();
  });

  it("never consumes the same heldBack candidate twice across different slots", async () => {
    const originalA = singleSourceOnlyEvent("origA", "business");
    const originalB = singleSourceOnlyEvent("origB", "business");
    const [summaryA, summaryB] = healthySummaryPair();
    const sharedPoolCandidate = cluster({ id: "shared", category: "business" });
    sharedPoolCandidate.items = [
      item({ outlet: "Outlet X", outletKey: "outlet-x", summary: summaryA }),
      item({ outlet: "Outlet Y", outletKey: "outlet-y", summary: summaryB }),
    ];

    const { resolved } = await resolveUsableEvents(
      [originalA, originalB],
      [sharedPoolCandidate],
      llm,
    );

    // Only one of the two slots can claim the single available replacement.
    const resolvedIds = resolved.map((r) => r.event.id);
    expect(resolvedIds.filter((id) => id === "shared")).toHaveLength(1);
    expect(resolved.length).toBeLessThanOrEqual(1);
  });
});
