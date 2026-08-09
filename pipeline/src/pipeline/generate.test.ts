/**
 * Unit tests for pipeline/generate.ts — generate+gate orchestration in both
 * modes, and the fallback ladder:
 *   batch submit fails outright  -> whole run falls back to standard calls
 *   individual batch request fails -> just that event falls back
 * NO REAL API CALLS — MockLLMProvider + structurally-fake Anthropic client.
 */

import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { generateAndGateAll } from "./generate.js";
import type { EventToGenerate } from "./generate.js";
import { MockLLMProvider } from "../llm/mock.js";
import type { ExtractedFact, RawItem } from "../types.js";

function facts(): ExtractedFact[] {
  return [
    {
      statement: "The committee approved the new rules on Thursday after a long debate.",
      confirmedByOutlets: ["Outlet A", "Outlet B"],
      sourceCount: 2,
      usedInText: true,
      searchSummaryOnly: true,
    },
    {
      statement: "Officials said implementation would begin next month across the region.",
      confirmedByOutlets: ["Outlet A", "Outlet B"],
      sourceCount: 2,
      usedInText: true,
      searchSummaryOnly: true,
    },
  ];
}

function items(): RawItem[] {
  return [
    {
      outlet: "Outlet A",
      url: "https://a.example/x",
      title: "Committee approves rules",
      summary: "The committee approved the new rules on Thursday.",
      publishedAt: null,
      category: "world",
      guid: "g1",
    },
    {
      outlet: "Outlet B",
      url: "https://b.example/y",
      title: "New rules approved",
      summary: "Officials said implementation would begin next month.",
      publishedAt: null,
      category: "world",
      guid: "g2",
    },
  ];
}

function event(id: string): EventToGenerate {
  return { eventId: id, category: "world", facts: facts(), sourceItems: items() };
}

function levelJson(level: string) {
  return { title: `${level} t`, content: `${level} c`, wordCount: 2, words: [] };
}
const COMBINED_TEXT = JSON.stringify({ A2: levelJson("A2"), B1: levelJson("B1"), B2: levelJson("B2") });

describe("generateAndGateAll — standard mode", () => {
  it("produces gated versions for all three levels per event with initial-draft usage attached", async () => {
    const llm = new MockLLMProvider();
    const drafts = await generateAndGateAll([event("e1"), event("e2")], { llm });

    expect(drafts).toHaveLength(2);
    for (const draft of drafts) {
      expect(draft.initialDraftMode).toBe("standard");
      expect(draft.gatedVersions.map((g) => g.version.level).sort()).toEqual(["A2", "B1", "B2"]);
      for (const gated of draft.gatedVersions) {
        // cefr, ngram_overlap, two_source, word_match, word_count.
        expect(gated.checks).toHaveLength(5);
        expect(gated.retryUsage).toBeDefined();
      }
    }
  });
});

describe("generateAndGateAll — batch mode fallbacks", () => {
  it("falls back to standard per-event calls when batch submission fails outright", async () => {
    const llm = new MockLLMProvider();
    const failingClient = {
      messages: {
        batches: {
          create: async () => {
            throw new Error("no batch permission");
          },
        },
      },
    } as unknown as Anthropic;

    const drafts = await generateAndGateAll([event("e1")], { llm, batchClient: failingClient });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].initialDraftMode).toBe("standard"); // fell back
    expect(drafts[0].gatedVersions).toHaveLength(3);
  });

  it("uses batch results when the batch succeeds, marking drafts as batch-mode", async () => {
    const llm = new MockLLMProvider();
    const okClient = {
      messages: {
        batches: {
          create: async () => ({
            id: "b1",
            processing_status: "in_progress",
            request_counts: { processing: 1, succeeded: 0 },
          }),
          retrieve: async () => ({
            id: "b1",
            processing_status: "ended",
            request_counts: { processing: 0, succeeded: 1 },
          }),
          results: async () =>
            (async function* () {
              yield {
                custom_id: "e1",
                result: {
                  type: "succeeded",
                  message: {
                    content: [{ type: "text", text: COMBINED_TEXT }],
                    usage: {
                      input_tokens: 3000,
                      output_tokens: 1200,
                      cache_creation_input_tokens: 0,
                      cache_read_input_tokens: 0,
                    },
                  },
                },
              };
            })(),
          cancel: async () => ({}),
        },
      },
    } as unknown as Anthropic;

    const drafts = await generateAndGateAll([event("e1")], { llm, batchClient: okClient });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].initialDraftMode).toBe("batch");
    expect(drafts[0].initialDraftUsage.inputTokens).toBe(3000);
    expect(drafts[0].gatedVersions).toHaveLength(3);
  });

  it("falls back per-event for requests that errored inside an otherwise-successful batch", async () => {
    const llm = new MockLLMProvider();
    const mixedClient = {
      messages: {
        batches: {
          create: async () => ({
            id: "b1",
            processing_status: "in_progress",
            request_counts: { processing: 2, succeeded: 0 },
          }),
          retrieve: async () => ({
            id: "b1",
            processing_status: "ended",
            request_counts: { processing: 0, succeeded: 1 },
          }),
          results: async () =>
            (async function* () {
              yield {
                custom_id: "e1",
                result: {
                  type: "succeeded",
                  message: {
                    content: [{ type: "text", text: COMBINED_TEXT }],
                    usage: {
                      input_tokens: 3000,
                      output_tokens: 1200,
                      cache_creation_input_tokens: 0,
                      cache_read_input_tokens: 0,
                    },
                  },
                },
              };
              yield {
                custom_id: "e2",
                result: { type: "errored", error: { type: "api_error", message: "boom" } },
              };
            })(),
          cancel: async () => ({}),
        },
      },
    } as unknown as Anthropic;

    const drafts = await generateAndGateAll([event("e1"), event("e2")], {
      llm,
      batchClient: mixedClient,
    });
    expect(drafts).toHaveLength(2);
    const byId = new Map(drafts.map((d) => [d.eventId, d]));
    expect(byId.get("e1")!.initialDraftMode).toBe("batch");
    expect(byId.get("e2")!.initialDraftMode).toBe("standard"); // fell back individually
    // No event is ever dropped because batching had a problem.
    expect(byId.get("e2")!.gatedVersions).toHaveLength(3);
  });
});
