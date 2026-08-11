/**
 * The shared paragraph plan is what keeps A2/B1/B2 comparable.
 *
 * Generating each level independently from one fact list already aligns the
 * content roughly, but paragraphs drift after the second or third beat. The
 * plan closes that gap WITHOUT deriving one level from another — writing A2 by
 * cutting B2 down produces a worse A2, because A2 needs repeated nouns and a
 * different information order, not the same prose with shorter words.
 *
 * The trap these tests exist for: a gate retry regenerates ONE level on its
 * own. If the plan does not reach that call, the levels that needed rework are
 * exactly the ones that lose alignment — the failure would be invisible until
 * a reader switched level mid-article.
 */

import { describe, expect, it } from "vitest";
import { gateVersion } from "./gate.js";
import { MockLLMProvider } from "../llm/mock.js";
import type { ArticleVersionDraft, ExtractedFact, RawItem } from "../types.js";
import type { LLMProvider, RewriteInput } from "../llm/provider.js";

const PLAN = ["Court sentences the former president", "What the polling work was", "Reaction"];

/**
 * Three load-bearing facts, each confirmed by two outlets — the minimum the
 * two-source gate requires. Below that the gate loop returns immediately
 * without retrying (a provenance failure cannot be fixed by rewriting), and
 * no rewrite call would be made for these tests to inspect.
 */
const FACTS: ExtractedFact[] = [
  {
    statement: "A court sentenced the former president to two years.",
    confirmedByOutlets: ["Outlet A", "Outlet B"],
    sourceCount: 2,
    usedInText: true,
    searchSummaryOnly: false,
  },
  {
    statement: "The polling work normally costs money.",
    confirmedByOutlets: ["Outlet A", "Outlet B"],
    sourceCount: 2,
    usedInText: true,
    searchSummaryOnly: false,
  },
  {
    statement: "The ruling was reported widely at home and abroad.",
    confirmedByOutlets: ["Outlet A", "Outlet B"],
    sourceCount: 2,
    usedInText: true,
    searchSummaryOnly: false,
  },
];

const SOURCE_ITEMS: RawItem[] = [
  {
    outlet: "Outlet A",
    url: "https://example.com/a",
    title: "Court sentences former president",
    summary: "A court sentenced the former president to two years.",
    publishedAt: "2026-07-13T06:00:00.000Z",
    category: "world",
    guid: "a",
  },
];

/** A draft short enough that the CEFR word-count band fails and forces a retry. */
function shortDraft(): ArticleVersionDraft {
  return {
    level: "B2",
    title: "Court sentences former president",
    content: "A court sentenced the former president to two years.",
    wordCount: 9,
    words: [],
  };
}

/** Records every rewrite() call so the test can inspect what the retry was told. */
function recordingProvider(): { llm: LLMProvider; calls: RewriteInput[] } {
  const base = new MockLLMProvider();
  const calls: RewriteInput[] = [];
  const llm = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "rewrite") {
        return async (input: RewriteInput) => {
          calls.push(input);
          return base.rewrite(input);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as LLMProvider;
  return { llm, calls };
}

describe("paragraph plan reaches the retry", () => {
  it("passes the plan to every regeneration of a failing level", async () => {
    const { llm, calls } = recordingProvider();

    await gateVersion(
      "event-1",
      "world",
      shortDraft(),
      FACTS,
      SOURCE_ITEMS,
      llm,
      PLAN,
    );

    // The draft is far under the B2 band, so the loop must have retried.
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.paragraphPlan).toEqual(PLAN);
    }
  });

  it("still retries when no plan exists, rather than failing the run", async () => {
    // Older editions and any response where the model omitted the plan must
    // degrade to the previous behaviour, not break generation.
    const { llm, calls } = recordingProvider();

    const result = await gateVersion(
      "event-1",
      "world",
      shortDraft(),
      FACTS,
      SOURCE_ITEMS,
      llm,
    );

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.paragraphPlan).toBeUndefined();
    }
    expect(result.rewriteAttempts).toBeGreaterThan(1);
  });
});

describe("combined generation emits a plan", () => {
  it("returns a beat list alongside the three levels", async () => {
    const out = await new MockLLMProvider().generateAllLevels({
      eventId: "event-1",
      category: "world",
      facts: FACTS,
    });
    expect(Array.isArray(out.paragraphPlan)).toBe(true);
    expect(out.paragraphPlan.length).toBeGreaterThan(0);
    expect(Object.keys(out.versions).sort()).toEqual(["A2", "B1", "B2"]);
  });
});
