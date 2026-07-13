/**
 * Unit tests for llm/batch.ts — Batch API round execution with fallback
 * semantics. NO REAL API CALLS: a structurally-fake Anthropic client is
 * passed in; tests assert submission shape, polling behavior, result
 * parsing keyed by custom_id, timeout fallback, and unavailable-API
 * signaling.
 */

import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runGenerateAllLevelsBatch } from "./batch.js";
import type { BatchGenerateRequest } from "./batch.js";
import type { ExtractedFact } from "../types.js";

const FACTS: ExtractedFact[] = [
  {
    statement: "Fact one.",
    confirmedByOutlets: ["A", "B"],
    sourceCount: 2,
    usedInText: true,
    searchSummaryOnly: true,
  },
];

function req(eventId: string): BatchGenerateRequest {
  return { eventId, category: "world", facts: FACTS };
}

function levelJson(level: string) {
  return {
    title: `${level} title`,
    content: `${level} content`,
    wordCount: 2,
    words: [],
  };
}

const COMBINED_TEXT = JSON.stringify({ A2: levelJson("A2"), B1: levelJson("B1"), B2: levelJson("B2") });

function successResult(customId: string) {
  return {
    custom_id: customId,
    result: {
      type: "succeeded",
      message: {
        content: [{ type: "text", text: COMBINED_TEXT }],
        usage: {
          input_tokens: 2000,
          output_tokens: 1500,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 1900,
        },
      },
    },
  };
}

/**
 * Fake client factory. `statusSequence` drives retrieve() responses;
 * `results` is what results() yields once ended.
 */
function fakeClient(options: {
  statusSequence: Array<"in_progress" | "ended">;
  results?: unknown[];
  createThrows?: Error;
  onCreate?: (body: unknown) => void;
  onCancel?: () => void;
}): Anthropic {
  let retrieveCall = 0;
  const client = {
    messages: {
      batches: {
        create: async (body: unknown) => {
          if (options.createThrows) throw options.createThrows;
          options.onCreate?.(body);
          return { id: "batch_test_1", processing_status: "in_progress", request_counts: { processing: 1, succeeded: 0 } };
        },
        retrieve: async () => {
          const status =
            options.statusSequence[Math.min(retrieveCall, options.statusSequence.length - 1)];
          retrieveCall++;
          return {
            id: "batch_test_1",
            processing_status: status,
            request_counts: { processing: status === "ended" ? 0 : 1, succeeded: 0 },
          };
        },
        results: async () => {
          const items = options.results ?? [];
          return (async function* () {
            for (const item of items) yield item;
          })();
        },
        cancel: async () => {
          options.onCancel?.();
          return { processing_status: "canceling" };
        },
      },
    },
  };
  return client as unknown as Anthropic;
}

const instantSleep = async () => {};

describe("runGenerateAllLevelsBatch", () => {
  it("submits one request per event with custom_id = eventId and returns parsed successes", async () => {
    let submitted: unknown;
    const client = fakeClient({
      statusSequence: ["in_progress", "ended"],
      results: [successResult("event-1"), successResult("event-2")],
      onCreate: (body) => (submitted = body),
    });

    const result = await runGenerateAllLevelsBatch(client, [req("event-1"), req("event-2")], {
      sleep: instantSleep,
      pollIntervalMs: 1,
    });

    const body = submitted as { requests: Array<{ custom_id: string; params: Record<string, unknown> }> };
    expect(body.requests.map((r) => r.custom_id)).toEqual(["event-1", "event-2"]);
    // Batch requests reuse the cached system prompt + structured output too.
    const params = body.requests[0].params as {
      system: Array<{ cache_control?: unknown }>;
      output_config: { format: { type: string } };
    };
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.output_config.format.type).toBe("json_schema");

    expect(result.batchUnavailable).toBe(false);
    expect(result.failed).toEqual([]);
    expect(result.succeeded).toHaveLength(2);
    expect(result.succeeded[0].versions.A2.title).toBe("A2 title");
    expect(result.succeeded[0].usage.cacheReadInputTokens).toBe(1900);
  });

  it("keys results by custom_id, not order (results may arrive out of order)", async () => {
    const client = fakeClient({
      statusSequence: ["ended"],
      results: [successResult("event-2"), successResult("event-1")], // reversed order
    });
    const result = await runGenerateAllLevelsBatch(client, [req("event-1"), req("event-2")], {
      sleep: instantSleep,
    });
    expect(result.succeeded.map((s) => s.eventId).sort()).toEqual(["event-1", "event-2"]);
  });

  it("reports per-request errors as failures without throwing", async () => {
    const client = fakeClient({
      statusSequence: ["ended"],
      results: [
        successResult("event-1"),
        {
          custom_id: "event-2",
          result: { type: "errored", error: { type: "invalid_request", message: "boom" } },
        },
      ],
    });
    const result = await runGenerateAllLevelsBatch(client, [req("event-1"), req("event-2")], {
      sleep: instantSleep,
    });
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ eventId: "event-2", reason: "errored" });
  });

  it("reports unparseable success payloads as parse_error failures", async () => {
    const client = fakeClient({
      statusSequence: ["ended"],
      results: [
        {
          custom_id: "event-1",
          result: {
            type: "succeeded",
            message: {
              content: [{ type: "text", text: "not json at all" }],
              usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            },
          },
        },
      ],
    });
    const result = await runGenerateAllLevelsBatch(client, [req("event-1")], { sleep: instantSleep });
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed[0]).toMatchObject({ eventId: "event-1", reason: "parse_error" });
  });

  it("falls back with reason=timeout (and attempts cancel) when the batch never ends in time", async () => {
    let cancelled = false;
    const client = fakeClient({
      statusSequence: ["in_progress"], // never ends
      onCancel: () => (cancelled = true),
    });
    const result = await runGenerateAllLevelsBatch(client, [req("event-1"), req("event-2")], {
      sleep: instantSleep,
      maxWaitMs: 1, // expire immediately
      pollIntervalMs: 1,
    });
    expect(result.batchUnavailable).toBe(false);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toHaveLength(2);
    expect(result.failed.every((f) => f.reason === "timeout")).toBe(true);
    expect(cancelled).toBe(true);
  });

  it("signals batchUnavailable when submission itself fails (caller falls back entirely)", async () => {
    const client = fakeClient({
      statusSequence: [],
      createThrows: new Error("batches API not permitted"),
    });
    const result = await runGenerateAllLevelsBatch(client, [req("event-1")], { sleep: instantSleep });
    expect(result.batchUnavailable).toBe(true);
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it("marks events missing from results as expired failures", async () => {
    const client = fakeClient({
      statusSequence: ["ended"],
      results: [successResult("event-1")], // event-2 never appears
    });
    const result = await runGenerateAllLevelsBatch(client, [req("event-1"), req("event-2")], {
      sleep: instantSleep,
    });
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ eventId: "event-2", reason: "expired" });
  });
});
