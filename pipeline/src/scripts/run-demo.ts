/**
 * Mock end-to-end demo — runs the full pipeline against TODAY's real RSS
 * feeds, with MockLLMProvider (no API key) and LocalFileStorageAdapter.
 *
 * Real:   [1] collect, [2] cluster (heuristic part), [3] 2-source gate,
 *         [6b] n-gram, [6a] CEFR heuristic, storage shape.
 * Mocked: LLM judgment/generation (boundary clustering, Top10 ranking,
 *         fact extraction, rewriting, CEFR boundary judgment).
 *
 * Output lands in pipeline/output/editions/<date>.json (status='review')
 * and pipeline/output/runs/<run-id>.json (pipeline_runs shape).
 *
 * Run with: npm run demo
 */

import { SOURCES } from "../config/sources.js";
import { runPipeline } from "../pipeline/run.js";
import { MockLLMProvider } from "../llm/mock.js";
import { LocalFileStorageAdapter } from "../storage/localFile.js";

async function main(): Promise<void> {
  const storage = new LocalFileStorageAdapter();
  const run = await runPipeline({
    sources: SOURCES,
    llm: new MockLLMProvider(),
    storage,
    // Full 10 articles: mock LLM is free, so no reason to cap.
    log: (m) => console.log(m),
  });

  console.log("\n=== Run summary ===");
  console.log(`status: ${run.status}`);
  console.log(`edition date: ${run.editionDate}`);
  console.log(`articles produced (검수 대기): ${run.articlesProduced}`);
  for (const s of run.stages) {
    console.log(`  [${s.ok ? "ok " : "FAIL"}] ${s.stage} ${JSON.stringify(s.detail)}`);
  }
  if (run.errorSummary) console.error(`error: ${run.errorSummary}`);

  const edition = await storage.getEdition(run.editionDate);
  if (edition) {
    console.log("\n=== Edition articles (status=review, awaiting human approval) ===");
    for (const a of edition.articles) {
      const gatePass = a.versions.filter((v) => v.passed).length;
      console.log(
        `  #${a.rankInEdition} [${a.category}] ${a.eventSummary.slice(0, 60)} — sources=${a.sources.length} facts=${a.facts.length} versions=${a.versions.length} gatesPassed=${gatePass}/3`,
      );
    }
  }
}

main().catch((err) => {
  console.error("[run-demo] fatal error", err);
  process.exitCode = 1;
});
