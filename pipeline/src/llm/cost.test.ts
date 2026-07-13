/**
 * Unit tests for llm/cost.ts — pricing math and the UsageLedger rollup.
 *
 * Expected values are hand-computed from PRICE_PER_MTOK (see cost.ts for the
 * pricing source + cache-date caveat); if the constants change these tests
 * must be updated alongside — that's intentional, a silent price change
 * should fail a test.
 */

import { describe, expect, it } from "vitest";
import {
  addUsage,
  emptyUsage,
  estimateCostUsd,
  PRICE_PER_MTOK,
  UsageLedger,
} from "./cost.js";

describe("estimateCostUsd", () => {
  it("charges plain input/output at list price (opus standard)", () => {
    // 1M input + 1M output on opus: $5 + $25 = $30
    const cost = estimateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      "opus",
      "standard",
    );
    expect(cost).toBeCloseTo(30.0, 6);
  });

  it("applies 1.25x to cache writes and 0.1x to cache reads", () => {
    // 1M cache-write on opus: 5 * 1.25 = $6.25; 1M cache-read: 5 * 0.1 = $0.50
    const writeCost = estimateCostUsd(
      { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 1_000_000, cacheReadInputTokens: 0 },
      "opus",
    );
    const readCost = estimateCostUsd(
      { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 1_000_000 },
      "opus",
    );
    expect(writeCost).toBeCloseTo(6.25, 6);
    expect(readCost).toBeCloseTo(0.5, 6);
  });

  it("applies the 50% batch discount to every token category", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
    };
    const standard = estimateCostUsd(usage, "opus", "standard");
    const batch = estimateCostUsd(usage, "opus", "batch");
    expect(batch).toBeCloseTo(standard / 2, 6);
  });

  it("uses per-tier pricing", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
    expect(estimateCostUsd(usage, "haiku")).toBeCloseTo(PRICE_PER_MTOK.haiku.input, 6);
    expect(estimateCostUsd(usage, "sonnet")).toBeCloseTo(PRICE_PER_MTOK.sonnet.input, 6);
    expect(estimateCostUsd(usage, "opus")).toBeCloseTo(PRICE_PER_MTOK.opus.input, 6);
  });

  it("returns 0 for empty usage", () => {
    expect(estimateCostUsd(emptyUsage(), "opus")).toBe(0);
  });
});

describe("addUsage", () => {
  it("sums every field", () => {
    const a = { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 3, cacheReadInputTokens: 4 };
    const b = { inputTokens: 10, outputTokens: 20, cacheCreationInputTokens: 30, cacheReadInputTokens: 40 };
    expect(addUsage(a, b)).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      cacheCreationInputTokens: 33,
      cacheReadInputTokens: 44,
    });
  });
});

describe("UsageLedger", () => {
  it("accumulates records and totals cost across stages", () => {
    const ledger = new UsageLedger();
    ledger.record({
      stage: "rewrite",
      eventId: "e1",
      tier: "opus",
      mode: "standard",
      usage: { inputTokens: 100_000, outputTokens: 10_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    });
    ledger.record({
      stage: "rewrite_retry",
      eventId: "e1",
      level: "B2",
      tier: "opus",
      mode: "standard",
      usage: { inputTokens: 50_000, outputTokens: 5_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    });

    // 150k in @$5/M + 15k out @$25/M = 0.75 + 0.375 = $1.125
    expect(ledger.totalUsd()).toBeCloseTo(1.125, 6);
    expect(ledger.totalTokens().inputTokens).toBe(150_000);
    expect(ledger.totalTokens().outputTokens).toBe(15_000);

    const byStage = ledger.byStage();
    expect(byStage.rewrite.calls).toBe(1);
    expect(byStage.rewrite_retry.calls).toBe(1);
    expect(byStage.rewrite.usage.inputTokens).toBe(100_000);
    expect(byStage.rewrite_retry.usage.inputTokens).toBe(50_000);
  });

  it("batch-mode records cost half of standard-mode records", () => {
    const usage = { inputTokens: 200_000, outputTokens: 20_000, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
    const standard = new UsageLedger();
    standard.record({ stage: "rewrite", tier: "opus", mode: "standard", usage });
    const batch = new UsageLedger();
    batch.record({ stage: "rewrite", tier: "opus", mode: "batch", usage });
    expect(batch.totalUsd()).toBeCloseTo(standard.totalUsd() / 2, 6);
  });

  it("produces a summary line with the total and token counts", () => {
    const ledger = new UsageLedger();
    ledger.record({
      stage: "rewrite",
      tier: "opus",
      mode: "standard",
      usage: { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 200, cacheReadInputTokens: 300 },
    });
    const line = ledger.summaryLine();
    expect(line).toContain("estimated cost $");
    expect(line).toContain("input=1000");
    expect(line).toContain("output=500");
    expect(line).toContain("cacheWrite=200");
    expect(line).toContain("cacheRead=300");
  });
});
