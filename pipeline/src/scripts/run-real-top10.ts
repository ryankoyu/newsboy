/**
 * One-off execution script for real Top 10 selection using the current
 * source whitelist and the Layer 1/2 rules-based selectTop10()
 * (top10-curation.md §1). Selection ONLY — no rewrite/extract stage.
 *
 * Composes the real pipeline stages as-is:
 *   collect() -> clusterEvents() -> selectTop10()
 * No manual post-hoc balance correction is applied anymore: selectTop10()
 * itself now enforces the category quota, same-country caps, duplicate-
 * subject exclusion, and tone balance (this replaces the old
 * "manualBalanceCorrection" pass that lived in this script before the
 * top10-curation.md Layer 1/2 rewrite).
 *
 * LLM bypass: MockLLMProvider stands in for every model call — the cluster
 * boundary judgments (judgeSameEvent), the Layer 2 learnability/demerit
 * scores, and the Layer 3 편집회의 proposal. Since Layer 3 now feeds a real
 * preference order into selection, the mock's answers DO move this script's
 * ranking around inside the Layer 1 rules; they are template heuristics, not
 * judgments, so read the output as a rules check rather than as the edition
 * a real run would produce. The GDELT global-reach signal is not gathered
 * here either — the report's `limitations` list says so for each run.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "../pipeline/collect.js";
import { clusterEvents } from "../pipeline/cluster.js";
import { selectTop10 } from "../pipeline/selectTop10.js";
import { SOURCES } from "../config/sources.js";
import { MockLLMProvider } from "../llm/mock.js";
import type { SelectedEvent } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITION_DATE = new Date().toISOString().slice(0, 10);
const OUTPUT_PATH = `${__dirname}/../../output/real-top10-${EDITION_DATE}.json`;

function toOutputEvent(event: SelectedEvent) {
  return {
    rank: event.rankInEdition,
    eventSummary: event.title,
    category: event.category,
    outletCount: event.outletCount,
    countries: event.countries,
    selectionRationale: event.selectionRationale,
    sources: event.items.map((i) => ({
      outlet: i.outlet,
      outletKey: i.outletKey ?? null,
      title: i.title,
      url: i.url,
      rssSummary: i.summary,
      publishedAt: i.publishedAt,
    })),
  };
}

async function main(): Promise<void> {
  console.log(`[real-top10] collecting from ${SOURCES.length} sources...`);
  const collectResult = await collect(SOURCES);
  console.log(`[real-top10] collected ${collectResult.items.length} raw items`);
  for (const r of collectResult.sourceReport) {
    console.log(
      `  [${r.ok ? "OK " : "FAIL"}] ${r.outlet.padEnd(28)} items=${String(r.itemCount).padEnd(4)} ${r.error ?? ""}`,
    );
  }

  const llm = new MockLLMProvider();

  console.log(`\n[real-top10] clustering (LLM boundary judgments via MockLLMProvider)...`);
  const clusters = await clusterEvents(collectResult.items, { llm });
  console.log(`[real-top10] ${clusters.length} clusters formed`);

  const result = await selectTop10(clusters, llm);
  console.log(`[real-top10] eligible (>=2 deduped sources): ${clusters.length - result.heldBack.filter((c) => c.outletCount < 2).length}`);
  console.log(`[real-top10] selected: ${result.selected.length}, held back: ${result.heldBack.length}`);

  const output = {
    editionDate: EDITION_DATE,
    generatedAt: new Date().toISOString(),
    llmBypass:
      "MockLLMProvider stands in for judgeSameEvent, the Layer 2 learnability/demerit scores, and the Layer 3 editorial proposal — template heuristics, not judgments. Layer 1 rules still enforce quota/caps/tone on top. No real LLM call made, no GDELT signal gathered, no rewrite/extract stage run.",
    sourceStats: collectResult.sourceReport,
    totalRawItems: collectResult.items.length,
    totalClusters: clusters.length,
    quota: result.report.quota,
    backfills: result.report.backfills,
    limitations: result.report.limitations,
    events: result.selected.map(toOutputEvent),
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  writeFileSync(
    `${__dirname}/../../output/selection-report-${EDITION_DATE}.json`,
    JSON.stringify(result.report, null, 2),
    "utf-8",
  );
  console.log(`\n[real-top10] wrote ${result.selected.length} events to ${OUTPUT_PATH}`);
  console.log(`[real-top10] wrote full selection report to output/selection-report-${EDITION_DATE}.json`);

  console.log("\n=== Final Top 10 ===");
  for (const e of output.events) {
    console.log(`${e.rank}. [${e.category}] (${e.outletCount} src, ${e.countries.join(",")}) ${e.eventSummary}`);
  }
  if (result.report.backfills.length > 0) {
    console.log("\n=== Backfill notes ===");
    for (const b of result.report.backfills) {
      console.log(`- ${b.category} slot ${b.slotIndex}: ${b.reason} (filledFrom=${b.filledFrom ?? "none"})`);
    }
  }
}

main().catch((err) => {
  console.error("[run-real-top10] fatal error", err);
  process.exitCode = 1;
});
