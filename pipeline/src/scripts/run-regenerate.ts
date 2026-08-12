/**
 * 반려(재생성 요청) 처리 실행 — production-readiness.md §2.
 *
 * Run with: npm run regenerate -- 2026-08-11 [articleId ...]
 *
 * Reads the edition the review console writes to, rewrites every article the
 * desk sent back (reviewDecision='regenerate') using the operator's note, and
 * puts each one back at 'pending' for a second look. Nothing is published
 * here — approval stays a human action in the console.
 *
 * Env: same provider selection as the main worker (LLM_PROVIDER, STORAGE).
 */

import { regenerateRequestedArticles } from "../pipeline/regenerate.js";
import { AnthropicLLMProvider } from "../llm/anthropic.js";
import { MockLLMProvider } from "../llm/mock.js";
import { LocalFileStorageAdapter } from "../storage/localFile.js";
import { SupabaseStorageAdapter } from "../storage/supabase.js";
import { UsageLedger } from "../llm/cost.js";
import type { LLMProvider } from "../llm/provider.js";
import type { StorageAdapter } from "../storage/adapter.js";

function buildLLM(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  if (provider === "mock") return new MockLLMProvider();
  if (provider === "anthropic") return new AnthropicLLMProvider();
  throw new Error(`[regenerate] unknown LLM_PROVIDER "${provider}"`);
}

function buildStorage(): StorageAdapter {
  const storage = process.env.STORAGE ?? "local";
  if (storage === "local") return new LocalFileStorageAdapter();
  if (storage === "supabase") return new SupabaseStorageAdapter();
  throw new Error(`[regenerate] unknown STORAGE "${storage}"`);
}

async function main(): Promise<number> {
  const [editionDate, ...articleIds] = process.argv.slice(2);
  if (!editionDate || !/^\d{4}-\d{2}-\d{2}$/.test(editionDate)) {
    console.error("사용법: npm run regenerate -- YYYY-MM-DD [articleId ...]");
    return 1;
  }

  const llm = buildLLM();
  const storage = buildStorage();
  const ledger = new UsageLedger();

  const result = await regenerateRequestedArticles(editionDate, {
    llm,
    storage,
    articleIds: articleIds.length > 0 ? articleIds : undefined,
    onUsage: ({ stage, usage }) =>
      ledger.record({
        stage,
        tier: stage === "cefr_judge" ? "haiku" : "opus",
        mode: "standard",
        usage,
      }),
  });

  console.log(
    `[regenerate] ${result.editionDate} — 요청 ${result.requested}건 중 ${result.regenerated}건 재생성`,
  );
  for (const o of result.outcomes) {
    const head = `  - #${o.rankInEdition} ${o.articleId}`;
    if (!o.ok) {
      console.log(`${head}: 실패 (${o.error}) — 반려 요청 유지`);
    } else {
      console.log(
        `${head}: 재생성 ${o.attempt}회차, status=${o.status}, 게이트 ${o.allLevelsPassed ? "전부 통과" : "일부 미통과"}`,
      );
    }
    for (const w of o.warnings) console.log(`      ! ${w}`);
  }
  console.log(`[regenerate] ${ledger.summaryLine()}`);

  return result.outcomes.some((o) => !o.ok) ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error("[run-regenerate] fatal error", err);
    process.exitCode = 1;
  });
