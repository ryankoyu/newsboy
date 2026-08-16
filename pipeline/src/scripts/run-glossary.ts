/**
 * 사전 뜻 채우기 — 이미 만들어진 에디션에 대해 사전만 다시 돌린다.
 *
 * Run with: npm run glossary -- 2026-08-12 [--dry]
 *
 * The glossary is a stage of the daily worker (pipeline/run.ts), so a normal
 * run needs nothing here. This exists for the case the worker cannot serve:
 * an edition that was written *before* the dictionary existed, or one whose
 * glossary stage failed. It reads the stored edition, works out which of its
 * words are still missing, and buys only those — a full pipeline run costs
 * about $1.5 and rewrites articles that were fine.
 *
 * `--dry` counts the words and stops without calling the model, so the cost
 * of a backfill can be looked at before it is spent.
 *
 * Env: same provider selection as the main worker (LLM_PROVIDER, STORAGE).
 */

import { AnthropicLLMProvider } from "../llm/anthropic.js";
import { MockLLMProvider } from "../llm/mock.js";
import { LocalFileStorageAdapter } from "../storage/localFile.js";
import { SupabaseStorageAdapter } from "../storage/supabase.js";
import { buildGlossary, collectTermsFromBodies, mayPersistGlosses } from "../pipeline/glossary.js";
import { estimateCostUsd } from "../llm/cost.js";
import type { LLMProvider } from "../llm/provider.js";
import type { StorageAdapter } from "../storage/adapter.js";

function buildLLM(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  if (provider === "mock") return new MockLLMProvider();
  if (provider === "anthropic") return new AnthropicLLMProvider();
  throw new Error(`[glossary] unknown LLM_PROVIDER "${provider}"`);
}

function buildStorage(): StorageAdapter {
  const storage = process.env.STORAGE ?? "local";
  if (storage === "local") return new LocalFileStorageAdapter();
  if (storage === "supabase") return new SupabaseStorageAdapter();
  throw new Error(`[glossary] unknown STORAGE "${storage}"`);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  const editionDate = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!editionDate) {
    console.error("사용법: npm run glossary -- YYYY-MM-DD [--dry]");
    return 1;
  }

  const storage = buildStorage();
  const bodies = await storage.getVersionBodies(editionDate);
  if (bodies.length === 0) {
    console.error(
      `[glossary] ${editionDate} 에디션의 기사 본문을 찾을 수 없습니다 (storage=${storage.name}). ` +
        "에디션 날짜가 맞는지, 그 저장소에 실제로 기사가 있는지 확인하세요.",
    );
    return 1;
  }

  const terms = collectTermsFromBodies(bodies);
  // A body list that yields no terms means the read went wrong, not that an
  // edition of English prose contains no words. Saying "0개" and exiting 0 is
  // how the first run of this script reported a half-populated read as a
  // success — it is a failure and it says so.
  if (terms.length === 0) {
    console.error(
      `[glossary] 본문 ${bodies.length}개를 읽었는데 단어가 하나도 나오지 않았습니다 — ` +
        "읽기 경로가 잘못됐을 가능성이 높습니다. 중단합니다.",
    );
    return 1;
  }

  const known = await storage.loadKnownGlossTerms();
  const missing = terms.filter((t) => !known.has(t));
  console.log(
    `[glossary] ${editionDate}: 본문 ${bodies.length}개, 단어 ${terms.length}개 ` +
      `(이미 있는 뜻 ${terms.length - missing.length}개, 새로 만들 것 ${missing.length}개)`,
  );

  if (dryRun) {
    // A rough figure, deliberately labelled as one: it assumes ~25 output
    // tokens per entry, which is what a short Korean gloss plus a part of
    // speech comes to. The real number lands in the run's cost summary.
    const estimate = estimateCostUsd(
      { inputTokens: missing.length * 3, outputTokens: missing.length * 25, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      "haiku",
      "standard",
    );
    console.log(`[glossary] --dry: 호출하지 않았습니다. 예상 비용 약 $${estimate.toFixed(4)} (추정치)`);
    return 0;
  }

  const llm = buildLLM();
  const result = await buildGlossary({ terms, known, llm, log: (m) => console.log(m) });
  if (!mayPersistGlosses(llm)) {
    console.log(
      `[glossary] ${result.entries.length}개를 만들었지만 저장하지 않았습니다 — ` +
        `${llm.name} 제공자의 뜻은 아무도 검수하지 않는 사전에 남을 수 없습니다.`,
    );
    return 0;
  }
  if (result.entries.length > 0) {
    await storage.saveGlosses(result.entries);
  }

  const cost = estimateCostUsd(result.usage, "haiku", "standard");
  console.log(
    `[glossary] 저장 ${result.entries.length}개` +
      (result.failedChunks > 0 ? `, 실패한 묶음 ${result.failedChunks}개` : "") +
      ` — 비용 약 $${cost.toFixed(4)} (provider=${llm.name}, storage=${storage.name})`,
  );
  // A failed chunk is not a failed backfill: the words it covered simply have
  // no gloss yet, and running this again picks up exactly those.
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error("[glossary] 실패:", err);
    process.exitCode = 1;
  });
