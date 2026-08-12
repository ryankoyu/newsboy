/**
 * Token usage tracking + cost estimation for the Anthropic API calls this
 * pipeline makes.
 *
 * [필수 선행] Per claude-api skill (cached 2026-06-24): pricing below is
 * current as of this writing but Anthropic can change it — kept as named
 * constants with the cache date in a comment so a future price change is a
 * one-line diff, not a hunt through the codebase.
 *
 * Cost model per skill "Prompt Caching" reference:
 *   - input_tokens: full price
 *   - cache_creation_input_tokens: ~1.25x input price (5-minute TTL, the only
 *     TTL this pipeline uses)
 *   - cache_read_input_tokens: ~0.1x input price
 *   - output_tokens: full output price
 * Batch API (non-streaming, async): 50% off every token category above,
 * applied uniformly per the Batches API docs referenced in the skill.
 */

import type { ModelTier } from "./provider.js";

/**
 * USD per 1M tokens. [문서] Anthropic pricing table, claude-api skill cache
 * date 2026-06-24 — re-check platform.claude.com/docs/en/pricing before
 * trusting these for a real invoice; update here only (single source).
 */
export const PRICE_PER_MTOK: Record<ModelTier, { input: number; output: number }> = {
  haiku: { input: 1.0, output: 5.0 },
  sonnet: { input: 3.0, output: 15.0 }, // sonnet-5 intro pricing ($2/$10) not assumed — uses list price
  opus: { input: 5.0, output: 25.0 },
};

/** Cache write premium / read discount multipliers (5-minute TTL — the only TTL used here). */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/** Batch API applies a flat 50% discount to every token category. */
const BATCH_DISCOUNT = 0.5;

/** Usage for a single API call, in the shape the Anthropic SDK returns it. */
export interface CallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export function emptyUsage(): CallUsage {
  return { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
}

export function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
  };
}

/** Estimate USD cost of one usage record for a given model tier and call mode. */
export function estimateCostUsd(
  usage: CallUsage,
  tier: ModelTier,
  mode: "standard" | "batch" = "standard",
): number {
  const price = PRICE_PER_MTOK[tier];
  const discount = mode === "batch" ? BATCH_DISCOUNT : 1;

  const inputCost = (usage.inputTokens / 1_000_000) * price.input * discount;
  const outputCost = (usage.outputTokens / 1_000_000) * price.output * discount;
  const cacheWriteCost =
    (usage.cacheCreationInputTokens / 1_000_000) * price.input * CACHE_WRITE_MULTIPLIER * discount;
  const cacheReadCost =
    (usage.cacheReadInputTokens / 1_000_000) * price.input * CACHE_READ_MULTIPLIER * discount;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

/** One row of the per-stage/per-article usage ledger this pipeline records. */
export interface UsageRecord {
  stage:
    | "select"
    | "extract"
    | "rewrite"
    | "rewrite_retry"
    | "cefr_judge"
    | "same_event"
    /** Layer 2 학습 적합성/감점 — one Haiku call per run, not per candidate. */
    | "learnability";
  eventId?: string;
  level?: string;
  tier: ModelTier;
  mode: "standard" | "batch";
  usage: CallUsage;
  costUsd: number;
}

export class UsageLedger {
  private records: UsageRecord[] = [];

  record(entry: Omit<UsageRecord, "costUsd">): UsageRecord {
    const costUsd = estimateCostUsd(entry.usage, entry.tier, entry.mode);
    const full: UsageRecord = { ...entry, costUsd };
    this.records.push(full);
    return full;
  }

  all(): UsageRecord[] {
    return [...this.records];
  }

  totalUsd(): number {
    return this.records.reduce((sum, r) => sum + r.costUsd, 0);
  }

  totalTokens(): CallUsage {
    return this.records.reduce((sum, r) => addUsage(sum, r.usage), emptyUsage());
  }

  /** Per-stage rollup for the run summary / pipeline_runs detail. */
  byStage(): Record<string, { calls: number; costUsd: number; usage: CallUsage }> {
    const out: Record<string, { calls: number; costUsd: number; usage: CallUsage }> = {};
    for (const r of this.records) {
      const bucket = out[r.stage] ?? { calls: 0, costUsd: 0, usage: emptyUsage() };
      bucket.calls += 1;
      bucket.costUsd += r.costUsd;
      bucket.usage = addUsage(bucket.usage, r.usage);
      out[r.stage] = bucket;
    }
    return out;
  }

  /** Human-readable one-line summary for end-of-run logging. */
  summaryLine(): string {
    const total = this.totalUsd();
    const tokens = this.totalTokens();
    return (
      `estimated cost $${total.toFixed(4)} ` +
      `(input=${tokens.inputTokens} output=${tokens.outputTokens} ` +
      `cacheWrite=${tokens.cacheCreationInputTokens} cacheRead=${tokens.cacheReadInputTokens})`
    );
  }
}
