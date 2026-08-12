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
 *   STORAGE=supabase                 — writes the real Supabase schema
 *                                      (requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 *                                      It has written to a live project once:
 *                                      Actions run 31493703937 (2026-08-11)
 *                                      logged stage=store ok with 1 article.
 *                                      That was a partial run, though —
 *                                      MAX_ARTICLES=2, and the run itself ended
 *                                      cancelled (see exitNow below). No run has
 *                                      yet stored a full Top10 with the real LLM,
 *                                      so treat the write path as proven only for
 *                                      the shapes storage/supabase.test.ts covers.
 *   MAX_ARTICLES=<n>                 — optional cap for cheaper runs.
 *   GDELT=false                      — skip the Layer 2 글로벌 영향력 signal
 *                                      (top10-curation.md §1). On by default:
 *                                      it is free and keyless, but it is a
 *                                      third-party endpoint with a 1-req/5s
 *                                      limit, so it adds a couple of minutes
 *                                      to the select stage. Turning it off
 *                                      costs ranking quality, not a run —
 *                                      the selection report records that the
 *                                      signal was missing.
 *   RESUME=false                     — start over instead of resuming this
 *                                      edition from its last checkpoint
 *                                      (a1 §2). Default is to resume, since
 *                                      the alternative is paying twice for
 *                                      stages that already succeeded.
 *   USE_BATCH_API=true               — use the Anthropic Batch API for the
 *                                      rewrite stage (~50% cheaper, but
 *                                      latency up to ~1h/24h) — see
 *                                      pipeline/generate.ts + llm/batch.ts.
 *                                      Defaults to true on a GitHub Actions
 *                                      *scheduled* run (nightly cron — see
 *                                      daily-pipeline.yml), false otherwise
 *                                      (manual workflow_dispatch, local dev)
 *                                      since interactive runs want the
 *                                      result now, not within the hour.
 *                                      Explicit USE_BATCH_API=false always
 *                                      wins over the schedule-based default.
 *
 * NOTE (quiz exclusion): design-decisions.md §4.5 — quizzes are NOT generated
 * by this pipeline. Vocabulary words are (they're part of the reader flow).
 */

import Anthropic from "@anthropic-ai/sdk";
import { SOURCES } from "./config/sources.js";
import { runPipeline } from "./pipeline/run.js";
import { createGdeltGlobalImpactProvider } from "./pipeline/globalImpact.js";
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
  if (storage === "supabase") return new SupabaseStorageAdapter(); // throws only if SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing
  throw new Error(`[pipeline] unknown STORAGE "${storage}" (expected "local" or "supabase")`);
}

/**
 * Decide whether the rewrite stage should use the Batch API, and return the
 * Anthropic client for it (batch submission isn't part of the LLMProvider
 * interface — see pipeline/generate.ts).
 *
 * Resolution order:
 *   1. USE_BATCH_API=false  -> never (explicit opt-out always wins)
 *   2. USE_BATCH_API=true   -> yes (if a key exists and provider is anthropic)
 *   3. unset + GitHub Actions *scheduled* run (GITHUB_EVENT_NAME=schedule)
 *      -> yes by default — the nightly cron has hours of slack, so the
 *      ~50% batch discount is free money there ("GitHub Actions 스케줄에선
 *      배치 기본 활성").
 *   4. otherwise -> no (interactive/manual runs want results now).
 *
 * Mock provider never gets a batch client: there is no API to batch against.
 */
function resolveBatchClient(llm: LLMProvider): Anthropic | undefined {
  if (llm.name !== "anthropic") return undefined;

  const flag = (process.env.USE_BATCH_API ?? "").toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return undefined;

  const isScheduledCi = process.env.GITHUB_EVENT_NAME === "schedule";
  const enabled = flag === "true" || flag === "1" || flag === "yes" || isScheduledCi;
  if (!enabled) return undefined;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return undefined; // AnthropicLLMProvider construction already failed loudly if this matters

  return new Anthropic({ apiKey: key });
}

/** Returns the process exit code — the caller ends the process (see exitNow). */
async function main(): Promise<number> {
  const llm = buildLLM();
  const storage = buildStorage();
  const maxArticles = process.env.MAX_ARTICLES ? Number(process.env.MAX_ARTICLES) : undefined;
  const batchClient = resolveBatchClient(llm);
  const resume = !["false", "0", "no"].includes((process.env.RESUME ?? "").toLowerCase());
  const gdeltOn = !["false", "0", "no"].includes((process.env.GDELT ?? "").toLowerCase());
  const globalImpact = gdeltOn
    ? createGdeltGlobalImpactProvider({ log: (m) => console.log(m) })
    : undefined;

  console.log(
    `[pipeline] starting — llm=${llm.name} storage=${storage.name} sources=${SOURCES.length}` +
      (maxArticles ? ` maxArticles=${maxArticles}` : "") +
      ` batchApi=${batchClient ? "on" : "off"}` +
      ` resume=${resume ? "on" : "off"}` +
      ` gdelt=${gdeltOn ? "on" : "off"}`,
  );

  const run = await runPipeline({
    sources: SOURCES,
    llm,
    storage,
    maxArticles,
    batchClient,
    globalImpact,
    resume,
  });

  console.log(`[pipeline] finished — status=${run.status} articles=${run.articlesProduced}`);
  for (const s of run.stages) {
    const resumedNote = s.detail?.resumedFromCheckpoint ? " (체크포인트에서 재개 — 재실행 안 함)" : "";
    console.log(`  - ${s.stage}: ${s.ok ? "ok" : `FAILED (${s.error})`}${resumedNote}`);
  }

  // 실행 종료 시 비용 요약 (usage 미보고 provider(mock)는 $0.00으로 나온다).
  if (run.costSummary) {
    console.log(
      `[pipeline] 이번 실행 예상 비용 $${run.costSummary.estimatedUsd.toFixed(2)}` +
        ` (batchApi=${run.costSummary.usedBatchApi ? "on" : "off"})`,
    );
    for (const [stageName, s] of Object.entries(run.costSummary.byStage)) {
      console.log(
        `  - ${stageName}: calls=${s.calls} $${s.costUsd.toFixed(4)} ` +
          `in=${s.inputTokens} out=${s.outputTokens} ` +
          `cacheWrite=${s.cacheCreationInputTokens} cacheRead=${s.cacheReadInputTokens}`,
      );
    }
  }

  if (run.status === "failed") {
    console.error(`[pipeline] run failed: ${run.errorSummary}`);
    return 1;
  }
  return 0;
}

/**
 * Wait until a piped stream has actually drained.
 *
 * On CI stdout is a pipe, and pipe writes are asynchronous — process.exit()
 * would drop whatever console.log() left buffered. An empty write's callback
 * fires once the stream is flushed, so the cost summary survives the exit.
 */
function flushStream(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    stream.write("", () => resolve());
  });
}

/**
 * End the process instead of waiting for the event loop to drain.
 *
 * 2026-08-11 CI: a STORAGE=supabase run logged "finished — status=success"
 * at 13:15:24 and then sat silent until a human cancelled it 26 minutes
 * later, burning the whole timeout-minutes budget. Setting process.exitCode
 * alone only takes effect once nothing is left holding the event loop.
 *
 * What holds it is still unidentified. The obvious suspect — the realtime
 * socket from createClient() — did NOT reproduce: against a dead project,
 * both a bare createClient() and a failed .from().select() drained and
 * exited on their own. So this does not try to close the right handle; it
 * ends the process, which is correct regardless of the culprit — this worker
 * is a batch job with nothing left to wait for once the edition is stored —
 * and logs whatever is still open so the next real run names the culprit.
 */
async function exitNow(code: number): Promise<never> {
  const lingering = process.getActiveResourcesInfo();
  if (lingering.length > 0) {
    console.log(`[pipeline] 종료 — 아직 열려 있는 핸들: ${lingering.join(", ")}`);
  }
  await flushStream(process.stdout);
  await flushStream(process.stderr);
  process.exit(code);
}

main()
  .then((code) => exitNow(code))
  .catch(async (err) => {
    console.error("[pipeline] fatal error", err);
    await exitNow(1);
  });
