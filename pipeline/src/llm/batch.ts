/**
 * Batch API execution path for the rewrite stage (cost optimization #3).
 *
 * Round-based flow (per task spec):
 *   1. Submit ALL events' combined-generation requests as one batch.
 *   2. Poll until the batch ends (or our own timeout elapses).
 *   3. Run gates on whatever succeeded.
 *   4. Submit a SECOND, smaller batch for events whose gate failed (retry).
 *   5. Any request that the batch API doesn't support, or that times out,
 *      falls back to a normal (non-batch) call for just that event —
 *      the pipeline never silently drops an event because batching had a
 *      problem.
 *
 * Batch API is ~50% cheaper per-token (see llm/cost.ts) but latency is
 * "usually within an hour, up to 24h" per the claude-api skill — GitHub
 * Actions scheduled runs (nightly) can afford this; interactive/manual runs
 * should not default to it (see index.ts USE_BATCH_API wiring).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { ExtractedFact, CategorySlug, CefrLevel, WordEntry } from "../types.js";
import type { CallUsage } from "./cost.js";
import { emptyUsage, addUsage } from "./cost.js";
import { COMBINED_OUTPUT_SCHEMA, COMBINED_SYSTEM_PROMPT } from "./prompts.js";

const MODEL = "claude-opus-4-8";

export interface BatchGenerateRequest {
  eventId: string;
  category: CategorySlug;
  facts: ExtractedFact[];
}

interface RawLevelOutput {
  title: string;
  content: string;
  wordCount: number;
  words: WordEntry[];
}

export interface BatchGenerateSuccess {
  eventId: string;
  versions: Record<CefrLevel, RawLevelOutput>;
  /**
   * Beats every level was written to. Carried through the batch path as well
   * as the standard one — production runs on the batch path (scheduled CI
   * enables it), so a plan that only survived standard calls would be missing
   * exactly where it matters.
   */
  paragraphPlan: string[];
  usage: CallUsage;
}

export interface BatchGenerateFailure {
  eventId: string;
  /** "errored" (API-side failure), "canceled", "expired", or "timeout" (our own poll deadline hit). */
  reason: "errored" | "canceled" | "expired" | "timeout" | "parse_error";
  detail: string;
}

export interface BatchGenerateResult {
  succeeded: BatchGenerateSuccess[];
  failed: BatchGenerateFailure[];
  /** True if the whole batch mechanism was unusable (e.g. API doesn't support it here) — caller should fall back entirely to standard calls. */
  batchUnavailable: boolean;
}

export interface BatchPollOptions {
  /** Max wall-clock time to wait for the batch to end, in ms. Default 55 min — leaves headroom in a 1h GH Actions job. */
  maxWaitMs?: number;
  /** Poll interval, in ms. Default 30s. */
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildRequestParams(req: BatchGenerateRequest): MessageCreateParamsNonStreaming {
  const user = JSON.stringify({ facts: req.facts, category: req.category });
  return {
    model: MODEL,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: COMBINED_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: COMBINED_OUTPUT_SCHEMA,
      },
    },
    messages: [{ role: "user", content: user }],
  };
}

function usageFromResponse(usage: Anthropic.Usage): CallUsage {
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
  };
}

function extractJsonFromText<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim()) as T;
}

/**
 * Submit one batch for the given requests, poll until it ends or our
 * deadline passes, and return succeeded/failed per event. Never throws for
 * ordinary batch-processing failures (errored/canceled/expired/timeout) —
 * those come back as `failed` entries so the caller can fall back to a
 * standard call per event. Throws only if the Batches API itself is
 * unreachable/rejects the submission outright (network error, 4xx on
 * create) — caller should catch that and set `batchUnavailable: true`.
 */
export async function runGenerateAllLevelsBatch(
  client: Anthropic,
  requests: BatchGenerateRequest[],
  options: BatchPollOptions = {},
): Promise<BatchGenerateResult> {
  const maxWaitMs = options.maxWaitMs ?? 55 * 60 * 1000;
  const pollIntervalMs = options.pollIntervalMs ?? 30_000;
  const sleep = options.sleep ?? defaultSleep;
  const log = options.log ?? (() => {});

  if (requests.length === 0) {
    return { succeeded: [], failed: [], batchUnavailable: false };
  }

  const byCustomId = new Map<string, BatchGenerateRequest>();
  for (const req of requests) {
    byCustomId.set(req.eventId, req);
  }

  let batch;
  try {
    batch = await client.messages.batches.create({
      requests: requests.map((req) => ({
        custom_id: req.eventId,
        params: buildRequestParams(req),
      })),
    });
  } catch (err) {
    log(`[batch] submission failed, batch API unavailable: ${String(err)}`);
    return { succeeded: [], failed: [], batchUnavailable: true };
  }

  log(`[batch] submitted batch ${batch.id} with ${requests.length} requests`);

  const deadline = Date.now() + maxWaitMs;
  let ended = false;
  while (Date.now() < deadline) {
    const current = await client.messages.batches.retrieve(batch.id);
    if (current.processing_status === "ended") {
      ended = true;
      break;
    }
    log(
      `[batch] ${batch.id} status=${current.processing_status} ` +
        `processing=${current.request_counts.processing} succeeded=${current.request_counts.succeeded}`,
    );
    await sleep(pollIntervalMs);
  }

  if (!ended) {
    // Timeout — every event that hasn't resolved yet is reported as a
    // timeout failure so the caller falls back to a standard call. We still
    // try to cancel server-side so it doesn't keep burning quota, but a
    // cancel failure must not mask the timeout outcome.
    try {
      await client.messages.batches.cancel(batch.id);
    } catch {
      // best-effort — the poll-deadline outcome below is authoritative regardless.
    }
    log(`[batch] ${batch.id} did not end within maxWaitMs=${maxWaitMs}; falling back per-event`);
    return {
      succeeded: [],
      failed: requests.map((r) => ({
        eventId: r.eventId,
        reason: "timeout" as const,
        detail: `batch did not end within ${maxWaitMs}ms`,
      })),
      batchUnavailable: false,
    };
  }

  const succeeded: BatchGenerateSuccess[] = [];
  const failed: BatchGenerateFailure[] = [];
  const seen = new Set<string>();

  for await (const result of await client.messages.batches.results(batch.id)) {
    seen.add(result.custom_id);
    const req = byCustomId.get(result.custom_id);
    if (!req) continue; // defensive — shouldn't happen, custom_id is ours

    if (result.result.type === "succeeded") {
      const message = result.result.message;
      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        failed.push({ eventId: result.custom_id, reason: "parse_error", detail: "no text content" });
        continue;
      }
      try {
        const parsed = extractJsonFromText<
          Record<CefrLevel, RawLevelOutput> & { paragraphPlan?: unknown }
        >(textBlock.text);
        succeeded.push({
          eventId: result.custom_id,
          versions: parsed,
          paragraphPlan: Array.isArray(parsed.paragraphPlan)
            ? parsed.paragraphPlan.filter(
                (x): x is string => typeof x === "string" && x.trim() !== "",
              )
            : [],
          usage: usageFromResponse(message.usage),
        });
      } catch (err) {
        failed.push({ eventId: result.custom_id, reason: "parse_error", detail: String(err) });
      }
    } else if (result.result.type === "errored") {
      failed.push({
        eventId: result.custom_id,
        reason: "errored",
        detail: JSON.stringify(result.result.error),
      });
    } else if (result.result.type === "canceled") {
      failed.push({ eventId: result.custom_id, reason: "canceled", detail: "canceled" });
    } else {
      failed.push({ eventId: result.custom_id, reason: "expired", detail: "expired" });
    }
  }

  // Any custom_id we submitted but never saw in results (shouldn't normally
  // happen once processing_status is "ended", but defend against it anyway).
  for (const req of requests) {
    if (!seen.has(req.eventId)) {
      failed.push({ eventId: req.eventId, reason: "expired", detail: "missing from results" });
    }
  }

  return { succeeded, failed, batchUnavailable: false };
}

export function totalBatchUsage(result: BatchGenerateResult): CallUsage {
  return result.succeeded.reduce((sum, s) => addUsage(sum, s.usage), emptyUsage());
}
