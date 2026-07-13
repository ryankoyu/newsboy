/**
 * One-off execution script for 2026-07-13 real Top 10 selection.
 *
 * Does NOT modify existing pipeline modules. Composes them as-is:
 *   collect() -> clusterEvents() -> selectTop10()
 * and then applies a manual category-balance correction pass, because
 * MockLLMProvider.selectTop10's "max 3 per category, outletCount-desc"
 * heuristic does not guarantee the requested content-strategy balance
 * (World 2-3 / Korea 2 / AI-Tech 2 / Business 2 / Culture-Sports 1).
 *
 * LLM bypass: MockLLMProvider is used for both judgeSameEvent (cluster
 * boundary cases) and selectTop10 (ranking). No real LLM call is made.
 * This is a deliberate bypass per task instructions — no Anthropic API
 * key is wired for this run, and the task only requires selection, not
 * rewriting.
 *
 * No LLM rewrite stage ([4] extract, [5] rewrite) is invoked at all.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collect } from "../pipeline/collect.js";
import { clusterEvents } from "../pipeline/cluster.js";
import { selectTop10 } from "../pipeline/selectTop10.js";
import { SOURCES } from "../config/sources.js";
import { MockLLMProvider } from "../llm/mock.js";
import type { CategorySlug, EventCluster, SelectedEvent } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITION_DATE = "2026-07-13";
const OUTPUT_PATH = `${__dirname}/../../output/real-top10-2026-07-13.json`;

// Target content-strategy balance (10 total).
const TARGET_BALANCE: Record<CategorySlug, number> = {
  world: 3,
  korea: 2,
  "ai-tech": 2,
  business: 2,
  "culture-sports": 1,
};

function oneSentenceSummary(cluster: EventCluster): string {
  // Use the representative (fullest-summary) item's title as the one-sentence
  // event summary — no invented facts, purely derived from collected data.
  const rep = cluster.items.reduce((best, cur) =>
    cur.summary.length > best.summary.length ? cur : best,
  );
  let sentence = rep.title.trim();
  if (!/[.!?]$/.test(sentence)) sentence += ".";
  return sentence;
}

function toOutputEvent(cluster: EventCluster, rank: number) {
  return {
    rank,
    eventSummary: oneSentenceSummary(cluster),
    category: cluster.category,
    outletCount: cluster.outletCount,
    sources: cluster.items.map((i) => ({
      outlet: i.outlet,
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

  // 2-source gate applied inside selectTop10 already; run it to get the
  // eligible/heldBack split and a baseline mock ranking.
  const { selected: mockSelected, heldBack } = await selectTop10(clusters, llm);
  console.log(`[real-top10] 2-source eligible clusters: ${clusters.length - heldBack.filter((c) => c.outletCount < 2).length}`);

  const eligible = clusters.filter((c) => c.outletCount >= 2);
  console.log(`[real-top10] eligible (>=2 outlets) clusters: ${eligible.length}`);
  console.log(`[real-top10] mock selectTop10 picked: ${mockSelected.length}`);

  // --- Manual category-balance correction pass ---------------------------
  // Rank eligible clusters within each category by outletCount desc, then
  // earliest publish time asc (prefer more corroborated / earlier-confirmed
  // stories), and fill the target balance. If a category is short, backfill
  // from the highest-outletCount leftover regardless of category to reach 10.
  const byCategory = new Map<CategorySlug, EventCluster[]>();
  for (const c of eligible) {
    const list = byCategory.get(c.category) ?? [];
    list.push(c);
    byCategory.set(c.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => {
      if (b.outletCount !== a.outletCount) return b.outletCount - a.outletCount;
      const ta = a.earliestPublishedAt ? new Date(a.earliestPublishedAt).getTime() : Infinity;
      const tb = b.earliestPublishedAt ? new Date(b.earliestPublishedAt).getTime() : Infinity;
      return ta - tb;
    });
  }

  const chosen: EventCluster[] = [];
  const chosenIds = new Set<string>();
  const balanceNotes: string[] = [];

  for (const [category, target] of Object.entries(TARGET_BALANCE) as [CategorySlug, number][]) {
    const list = byCategory.get(category) ?? [];
    const picked = list.slice(0, target);
    for (const c of picked) {
      chosen.push(c);
      chosenIds.add(c.id);
    }
    if (picked.length < target) {
      balanceNotes.push(
        `${category}: wanted ${target}, only ${picked.length} eligible (>=2 outlets) clusters available`,
      );
    }
  }

  // Backfill to 10 if short, from remaining eligible clusters (any category),
  // highest outletCount first.
  if (chosen.length < 10) {
    const leftover = eligible
      .filter((c) => !chosenIds.has(c.id))
      .sort((a, b) => b.outletCount - a.outletCount);
    for (const c of leftover) {
      if (chosen.length >= 10) break;
      chosen.push(c);
      chosenIds.add(c.id);
      balanceNotes.push(`backfilled ${c.category} cluster "${c.title}" to reach 10 total`);
    }
  }

  // Final safety: enforce 2-source rule strictly (should already hold since
  // `eligible` was pre-filtered, but double-check per task instruction #4).
  const final = chosen.filter((c) => c.outletCount >= 2).slice(0, 10);
  if (final.length < chosen.length) {
    balanceNotes.push(
      `dropped ${chosen.length - final.length} cluster(s) that failed the 2-source check at final assembly`,
    );
  }

  const output = {
    editionDate: EDITION_DATE,
    generatedAt: new Date().toISOString(),
    llmBypass: "MockLLMProvider used for cluster boundary judgments (judgeSameEvent) and baseline ranking (selectTop10). No real LLM call made. No rewrite/extract stage run.",
    manualBalanceCorrection: balanceNotes.length > 0 ? balanceNotes : ["none needed"],
    sourceStats: collectResult.sourceReport,
    totalRawItems: collectResult.items.length,
    totalClusters: clusters.length,
    eligibleClusters: eligible.length,
    events: final.map((c, idx) => toOutputEvent(c, idx + 1)),
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n[real-top10] wrote ${final.length} events to ${OUTPUT_PATH}`);

  console.log("\n=== Final Top 10 ===");
  for (const e of output.events) {
    console.log(`${e.rank}. [${e.category}] (${e.outletCount} outlets) ${e.eventSummary}`);
  }
  if (balanceNotes.length > 0 && balanceNotes[0] !== "none needed") {
    console.log("\n=== Balance correction notes ===");
    for (const n of balanceNotes) console.log(`- ${n}`);
  }
}

main().catch((err) => {
  console.error("[run-real-top10] fatal error", err);
  process.exitCode = 1;
});
