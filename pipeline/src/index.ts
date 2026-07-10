/**
 * BRIEFLY daily content pipeline — production entry point.
 *
 * Implements stages [1]-[6] of docs/design/a1-architecture.md §2 and stores
 * results as 검수 대기 (status='review'). Stages [7] approval and [8] publish
 * happen in the web/ admin screen — never here.
 *
 * Intended execution: GitHub Actions daily schedule
 * (.github/workflows/daily-pipeline.yml, design-decisions.md §3-1).
 *
 * Provider selection (env):
 *   LLM_PROVIDER=anthropic (default) — requires ANTHROPIC_API_KEY, fails fast without it.
 *   LLM_PROVIDER=mock                — deterministic mock, for demo/dry runs.
 *   STORAGE=local (default)          — writes pipeline/output/*.json.
 *   STORAGE=supabase                 — skeleton, throws until implemented
 *                                      (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 *   MAX_ARTICLES=<n>                 — optional cap for cheaper runs.
 *
 * NOTE (quiz exclusion): design-decisions.md §4.5 — quizzes are NOT generated
 * by this pipeline. Vocabulary words are (they're part of the reader flow).
 */

import { SOURCES } from "./config/sources.js";
import { runPipeline } from "./pipeline/run.js";
import type { LLMProvider } from "./llm/provider.js";
import type { StorageAdapter } from "./storage/adapter.js";
import { AnthropicLLMProvider } from "./llm/anthropic.js";
import { MockLLMProvider } from "./llm/mock.js";
import { LocalFileStorageAdapter } from "./storage/localFile.js";
import { SupabaseStorageAdapter } from "./storage/supabase.js";

function buildLLM(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  if (provider === "mock") return new MockLLMProvider();
  if (provider === "anthropic") return new AnthropicLLMProvider(); // throws clearly if key missing
  throw new Error(`[pipeline] unknown LLM_PROVIDER "${provider}" (expected "anthropic" or "mock")`);
}

function buildStorage(): StorageAdapter {
  const storage = process.env.STORAGE ?? "local";
  if (storage === "local") return new LocalFileStorageAdapter();
  if (storage === "supabase") return new SupabaseStorageAdapter(); // skeleton — throws on use
  throw new Error(`[pipeline] unknown STORAGE "${storage}" (expected "local" or "supabase")`);
}

async function main(): Promise<void> {
  const llm = buildLLM();
  const storage = buildStorage();
  const maxArticles = process.env.MAX_ARTICLES ? Number(process.env.MAX_ARTICLES) : undefined;

  console.log(
    `[pipeline] starting — llm=${llm.name} storage=${storage.name} sources=${SOURCES.length}` +
      (maxArticles ? ` maxArticles=${maxArticles}` : ""),
  );

  const run = await runPipeline({ sources: SOURCES, llm, storage, maxArticles });

  console.log(`[pipeline] finished — status=${run.status} articles=${run.articlesProduced}`);
  for (const s of run.stages) {
    console.log(`  - ${s.stage}: ${s.ok ? "ok" : `FAILED (${s.error})`}`);
  }
  if (run.status === "failed") {
    console.error(`[pipeline] run failed: ${run.errorSummary}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[pipeline] fatal error", err);
  process.exitCode = 1;
});
