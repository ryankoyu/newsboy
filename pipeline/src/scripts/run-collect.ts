/**
 * Manual verification script for [1] RSS 수집.
 * Run with: npm run collect
 * Prints per-source counts and a small sample so a human can eyeball the
 * real network result (no LLM, no mocking — this stage is fully real).
 */

import { collect } from "../pipeline/collect.js";
import { SOURCES } from "../config/sources.js";

async function main(): Promise<void> {
  console.log(`[collect] fetching ${SOURCES.length} sources...`);
  const result = await collect(SOURCES);

  console.log("\n=== Per-source report ===");
  for (const r of result.sourceReport) {
    const status = r.ok ? "OK " : "FAIL";
    console.log(`[${status}] ${r.outlet.padEnd(28)} items=${String(r.itemCount).padEnd(4)} ${r.error ?? ""}`);
  }

  console.log(`\nTotal items collected: ${result.items.length}`);

  console.log("\n=== Sample (first 5) ===");
  for (const item of result.items.slice(0, 5)) {
    console.log(`- [${item.category}] (${item.outlet}) ${item.title}`);
  }
}

main().catch((err) => {
  console.error("[run-collect] fatal error", err);
  process.exitCode = 1;
});
