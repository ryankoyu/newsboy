/**
 * 반려(재생성 요청) 처리 — production-readiness.md §2 "기사별 승인/반려(재생성
 * 요청)/제외".
 *
 * The review console can send one article back to the pipeline with a note
 * ("본문이 딱딱하다", "제목이 원문과 비슷하다"): it writes
 * reviewDecision='regenerate' + regenerateNote onto that article. This is the
 * worker that acts on the request — without it "반려" would be a label the
 * desk applies and nothing ever answers.
 *
 * What it deliberately does NOT do:
 *  - re-collect or re-select. The desk objected to the WRITING, not to the
 *    story choice, so the event's extracted facts and sources are reused
 *    exactly as they are. Re-extracting would spend Sonnet money to (at best)
 *    reproduce the same fact list and (at worst) quietly change which facts
 *    the article rests on.
 *  - publish, or approve. A regenerated article returns to 'pending', so the
 *    desk still decides (a1 §2: "사람 승인 없이는 절대 발행되지 않는다").
 *  - use the Batch API. One article at an operator's desk is an interactive
 *    wait, and batch latency is "usually <1h, up to 24h".
 *
 * A failed regeneration leaves the request standing: the article keeps
 * reviewDecision='regenerate' and its old versions, so the operator sees an
 * unanswered request rather than a silently unchanged article.
 */

import type {
  ArticleStatus,
  GatedVersion,
  PipelineArticle,
  PipelineEdition,
  RawItem,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { CallUsage } from "../llm/cost.js";
import { gateVersion } from "./gate.js";
import { rewriteAllLevels } from "./rewrite.js";
import { articleStatusForGatedVersions } from "./run.js";

export interface RegenerationOutcome {
  articleId: string;
  rankInEdition: number;
  /** The operator's note this regeneration was answering. */
  note: string;
  ok: boolean;
  /** Article status after re-gating — 'held' if the two-source check still fails. */
  status?: ArticleStatus;
  /** True when all three levels passed their gates on this attempt. */
  allLevelsPassed?: boolean;
  /** 1 for the first regeneration of this article, 2 for the next, ... */
  attempt?: number;
  warnings: string[];
  error?: string;
}

export interface RegenerateResult {
  editionDate: string;
  requested: number;
  regenerated: number;
  outcomes: RegenerationOutcome[];
}

export interface RegenerateOptions {
  llm: LLMProvider;
  storage: StorageAdapter;
  /** Restrict the run to specific article ids; default is every outstanding request. */
  articleIds?: string[];
  /** Called once per priced LLM call so a caller can total the cost. */
  onUsage?: (entry: { stage: "rewrite" | "rewrite_retry" | "cefr_judge"; usage: CallUsage }) => void;
  log?: (message: string) => void;
}

/** Articles the desk has sent back and the pipeline has not answered yet. */
export function articlesAwaitingRegeneration(edition: PipelineEdition): PipelineArticle[] {
  return edition.articles.filter((a) => a.reviewDecision === "regenerate");
}

/**
 * Rebuild the RawItem list the gate needs from what the edition file stored.
 *
 * Editions written before PipelineSourceRef carried `summary` have only
 * titles, and gate.ts's n-gram-overlap check compares the rewritten text
 * against whatever text it is handed — so a title-only reconstruction would
 * quietly turn a body-overlap check into a headline-overlap check. That is a
 * weaker check, not a broken one, so regeneration proceeds and says so in a
 * warning instead of refusing.
 */
function rebuildSourceItems(article: PipelineArticle): {
  items: RawItem[];
  warnings: string[];
} {
  const missingSnippets = article.sources.filter((s) => !s.summary).length;
  const warnings: string[] = [];
  if (missingSnippets > 0) {
    warnings.push(
      `소스 ${missingSnippets}건에 원문 스니펫이 저장돼 있지 않습니다 — ` +
        "n-gram 중복 검사가 제목만 기준으로 수행됩니다(재수집 없이는 복구 불가).",
    );
  }
  const items: RawItem[] = article.sources.map((s, idx) => ({
    outlet: s.outlet,
    url: s.url,
    title: s.title,
    summary: s.summary ?? "",
    publishedAt: s.publishedAt ?? null,
    category: article.category,
    guid: `${article.id}-source-${idx}`,
    outletKey: s.outletKey,
    country: s.country,
  }));
  return { items, warnings };
}

/**
 * Regenerate one article in place. Exported for tests and for callers that
 * already hold the edition; `regenerateRequestedArticles` is the normal entry.
 */
export async function regenerateArticle(
  article: PipelineArticle,
  options: Pick<RegenerateOptions, "llm" | "onUsage">,
): Promise<{ outcome: RegenerationOutcome; updated?: PipelineArticle }> {
  const note = article.regenerateNote?.trim() ?? "";
  const { items, warnings } = rebuildSourceItems(article);

  try {
    const rewritten = await rewriteAllLevels(
      article.id,
      article.category,
      article.facts,
      options.llm,
      note || undefined,
    );
    options.onUsage?.({ stage: "rewrite", usage: rewritten.usage });

    const gatedVersions: GatedVersion[] = [];
    let allPassed = true;
    for (const version of rewritten.versions) {
      const gated = await gateVersion(
        article.id,
        article.category,
        version,
        article.facts,
        items,
        options.llm,
        rewritten.paragraphPlan,
      );
      for (const usage of gated.cefrJudgeUsages) {
        options.onUsage?.({ stage: "cefr_judge", usage });
      }
      if (gated.rewriteAttempts > 1) {
        options.onUsage?.({ stage: "rewrite_retry", usage: gated.retryUsage });
      }
      if (!gated.passed) allPassed = false;
      gatedVersions.push({
        version: gated.version,
        checks: gated.checks,
        passed: gated.passed,
        rewriteAttempts: gated.rewriteAttempts,
      });
    }

    const attempt = (article.regenerationCount ?? 0) + 1;
    const status = articleStatusForGatedVersions(gatedVersions);
    const updated: PipelineArticle = {
      ...article,
      versions: gatedVersions,
      status,
      // Back to the desk, never straight to approved: the operator asked for
      // a rewrite, not for the pipeline to sign off on its own work.
      reviewDecision: "pending",
      regenerateRequestedAt: undefined,
      regenerationCount: attempt,
      regeneratedAt: new Date().toISOString(),
    };
    // The slug is deliberately left alone even though the headline changed:
    // it may already be published/linked, and re-slugging would 404 those
    // links (see run.ts slugify doc comment).

    return {
      updated,
      outcome: {
        articleId: article.id,
        rankInEdition: article.rankInEdition,
        note,
        ok: true,
        status,
        allLevelsPassed: allPassed,
        attempt,
        warnings: allPassed
          ? warnings
          : [...warnings, "재생성 후에도 통과하지 못한 품질 게이트가 있습니다 — 검수 화면에서 확인하세요."],
      },
    };
  } catch (err) {
    return {
      outcome: {
        articleId: article.id,
        rankInEdition: article.rankInEdition,
        note,
        ok: false,
        warnings,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Answer every outstanding 반려 request in one edition and persist the result.
 *
 * The edition is written back once, at the end, and only if at least one
 * article actually changed — a run where every regeneration failed must not
 * rewrite the file the console is reading.
 */
export async function regenerateRequestedArticles(
  editionDate: string,
  options: RegenerateOptions,
): Promise<RegenerateResult> {
  const log = options.log ?? ((m: string) => console.log(m));
  const edition = await options.storage.getEdition(editionDate);
  if (!edition) throw new Error(`Edition not found: ${editionDate}`);

  let pendingRequests = articlesAwaitingRegeneration(edition);
  if (options.articleIds) {
    const wanted = new Set(options.articleIds);
    pendingRequests = pendingRequests.filter((a) => wanted.has(a.id));
  }

  const outcomes: RegenerationOutcome[] = [];
  let changed = 0;

  for (const article of pendingRequests) {
    log(`[regenerate] #${article.rankInEdition} ${article.id} — "${article.regenerateNote ?? ""}"`);
    const { outcome, updated } = await regenerateArticle(article, options);
    outcomes.push(outcome);
    if (updated) {
      const idx = edition.articles.findIndex((a) => a.id === article.id);
      edition.articles[idx] = updated;
      changed++;
    } else {
      log(`[regenerate] #${article.rankInEdition} 실패: ${outcome.error} — 반려 요청을 그대로 둡니다`);
    }
  }

  if (changed > 0) {
    await options.storage.saveEdition(edition);
  }

  return {
    editionDate,
    requested: pendingRequests.length,
    regenerated: changed,
    outcomes,
  };
}
