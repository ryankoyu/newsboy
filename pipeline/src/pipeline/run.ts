/**
 * Pipeline orchestrator — wires stages [1]-[6] + storage per
 * a1-architecture.md §2.
 *
 * Stage [7] (사람 최종 승인) is intentionally NOT here: articles are persisted
 * with status='review' and the human approves in the web/ admin screen.
 * Stage [8] (발행) is a status flip performed after approval, also outside
 * this worker. This worker must never set status beyond 'review'
 * (a1 §2: "사람 승인 없이는 절대 발행되지 않는다").
 *
 * Every stage's outcome is recorded into a PipelineRun so a failure is
 * visible per-stage (a1 §5.3 pipeline_runs). Resume-from-last-stage is a
 * TODO for the Supabase-backed version — with local file storage a re-run
 * is cheap enough to just start over.
 */

import { randomUUID } from "node:crypto";
import type {
  CollectResult,
  GatedVersion,
  PipelineArticle,
  PipelineEdition,
  PipelineRun,
  PipelineStage,
  SelectedEvent,
  StageOutcome,
  CheckKind,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { SourceConfig } from "../types.js";
import { collect } from "./collect.js";
import { clusterEvents } from "./cluster.js";
import { selectTop10 } from "./selectTop10.js";
import { resolveUsableEvents, MIN_USABLE_FACTS_TO_REWRITE } from "./replaceLowUsableFacts.js";
import { generateAndGateAll } from "./generate.js";
import type { EventToGenerate } from "./generate.js";
import { UsageLedger } from "../llm/cost.js";
import type Anthropic from "@anthropic-ai/sdk";

export interface RunOptions {
  sources: SourceConfig[];
  llm: LLMProvider;
  storage: StorageAdapter;
  /** YYYY-MM-DD; defaults to today (local time of the runner). */
  editionDate?: string;
  /** Cap on articles fully processed — useful for cheap demo runs. */
  maxArticles?: number;
  /**
   * When set, the generate/gate stage submits ALL events as one batch
   * (Anthropic Batch API) instead of one call per event — ~50% cheaper,
   * but latency is "usually <1h, up to 24h" so this is intended for
   * scheduled (nightly) runs, not interactive ones. Requires a real
   * Anthropic SDK client (batch submission isn't part of the LLMProvider
   * interface — MockLLMProvider runs never set this).
   */
  batchClient?: Anthropic;
  log?: (message: string) => void;
}

/**
 * Slugify a title and append a uniqueness suffix.
 *
 * `articles.slug` has a `unique` constraint (supabase/migrations/0001_schema.sql),
 * but two Top-10 events on the same day can produce identical title-derived
 * slugs (e.g. near-duplicate headlines, or a rewrite that reuses generic
 * phrasing) — a bare slugify() risked a same-day collision. Appending
 * `rankInEdition` (1..10, unique within one edition) makes same-day
 * collisions impossible without touching the human-readable prefix.
 */
export function slugify(title: string, rankInEdition: number): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || `article-${randomUUID().slice(0, 8)}`;
  return `${base}-${rankInEdition}`;
}

/**
 * Article-level status derived from a set of gated versions: if ANY version
 * failed its two_source check post-rewrite, the whole article is 'held' for
 * human review — not just that one version. gate.ts's two_source check
 * operates on `facts`, which are SHARED across all 3 CEFR levels (extraction
 * is level-agnostic), so a two_source failure is a provenance problem with
 * the underlying facts, not a per-level rewrite quality issue; flagging only
 * the failing version would leave the other 2 levels publishable even
 * though they were built from the same unconfirmed facts
 * (news-sourcing-strategy.md §2 rule #2, 2026-07-14 two-source bypass fix).
 */
export function articleStatusForGatedVersions(gatedVersions: GatedVersion[]): "review" | "held" {
  const twoSourceFailed = gatedVersions.some((g) =>
    g.checks.some((c) => c.kind === "two_source" && !c.passed),
  );
  return twoSourceFailed ? "held" : "review";
}

function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function runPipeline(options: RunOptions): Promise<PipelineRun> {
  const log = options.log ?? ((m: string) => console.log(m));
  const editionDate = options.editionDate ?? todayISODate();
  const run: PipelineRun = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    editionDate,
    status: "running",
    stages: [],
    articlesProduced: 0,
  };

  async function stage<T>(name: PipelineStage, fn: () => Promise<T>): Promise<T> {
    const startedAt = new Date().toISOString();
    log(`[pipeline] stage=${name} starting`);
    try {
      const result = await fn();
      const outcome: StageOutcome = {
        stage: name,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: true,
        detail: summarizeStage(name, result),
      };
      run.stages.push(outcome);
      log(`[pipeline] stage=${name} ok ${JSON.stringify(outcome.detail)}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.stages.push({
        stage: name,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: false,
        detail: {},
        error: message,
      });
      throw err;
    }
  }

  // Hoisted above the try so the finally-block cost summary can read it even
  // when a stage threw partway through (tokens spent before the failure are
  // still real cost).
  const usageLedger = new UsageLedger();

  try {
    // [1] 수집
    const collected = await stage("collect", () => collect(options.sources));

    // [2] 클러스터링
    const clusters = await stage("cluster", () =>
      clusterEvents(collected.items, {
        llm: options.llm,
        onUsage: (usage) =>
          usageLedger.record({ stage: "same_event", tier: "haiku", mode: "standard", usage }),
      }),
    );

    // [3] Top 10 선정 (2소스 게이트 포함)
    const top10 = await stage("select", () => selectTop10(clusters, options.llm));
    // The rationale call is a real Sonnet call; it went unpriced until now.
    if (top10.usage) {
      usageLedger.record({ stage: "select", tier: "sonnet", mode: "standard", usage: top10.usage });
    }

    const eventsToProcess = options.maxArticles
      ? top10.selected.slice(0, options.maxArticles)
      : top10.selected;

    // [4] 사실 추출 (per event) + 재작성 전 usable-fact 차단.
    //
    // FIX (2026-07-14 two-source bypass incident): extraction alone isn't
    // enough — an event can pass selectTop10's raw outletCount gate yet
    // extract down to <2-source-confirmed facts (see
    // replaceLowUsableFacts.ts doc comment for the incident's root cause).
    // resolveUsableEvents() extracts each selected event and, when an event
    // comes back with fewer than MIN_USABLE_FACTS_TO_REWRITE usable facts,
    // swaps it for the next-best same-category `heldBack` candidate BEFORE
    // any rewrite call is made — rewrite is the expensive stage, so failing
    // here is far cheaper than failing at the two_source gate after a full
    // 3-level draft has already been generated.
    const articles: PipelineArticle[] = [];

    const extractStart = new Date().toISOString();
    let totalFactsExtracted = 0;
    let totalFactsUsedInText = 0;
    const eventsToGenerate: EventToGenerate[] = [];
    // Resolved events may differ from top10.selected (dropped-and-replaced
    // slots) — this is the map generate/gate and article assembly use below,
    // NOT the original top10.selected list.
    let resolvedEventsById = new Map<string, SelectedEvent>();

    try {
      const { resolved, log: replacementLog, extractionUsages } = await resolveUsableEvents(
        eventsToProcess,
        top10.heldBack,
        options.llm,
        log,
      );

      // One record per extraction call, discarded candidates included — those
      // cost money too, and hiding them would understate the stage.
      for (const usage of extractionUsages) {
        usageLedger.record({ stage: "extract", tier: "sonnet", mode: "standard", usage });
      }

      resolvedEventsById = new Map(resolved.map((r) => [r.event.id, r.event]));

      for (const { event, facts } of resolved) {
        const usableCount = facts.filter((f) => f.usedInText).length;
        totalFactsExtracted += facts.length;
        totalFactsUsedInText += usableCount;
        eventsToGenerate.push({
          eventId: event.id,
          category: event.category,
          facts,
          sourceItems: event.items,
        });
      }

      if (replacementLog.length > 0) {
        log(
          `[pipeline] extract-stage replacements: ${replacementLog.length} slot(s) affected (see pipeline_run 'extract' stage detail for the full log)`,
        );
      }

      run.stages.push({
        stage: "extract",
        startedAt: extractStart,
        finishedAt: new Date().toISOString(),
        ok: true,
        detail: {
          eventsProcessed: eventsToProcess.length,
          eventsResolved: resolved.length,
          factsExtracted: totalFactsExtracted,
          factsUsedInText: totalFactsUsedInText,
          minUsableFactsRequired: MIN_USABLE_FACTS_TO_REWRITE,
          // Full audit trail of every drop/replace/empty-slot decision made
          // by resolveUsableEvents — this is the "pipeline_runs 기록"
          // required by the two-source bypass fix.
          extractReplacements: replacementLog,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.stages.push({
        stage: "extract",
        startedAt: extractStart,
        finishedAt: new Date().toISOString(),
        ok: eventsToGenerate.length > 0,
        detail: {
          eventsProcessed: eventsToGenerate.length,
          factsExtracted: totalFactsExtracted,
          factsUsedInText: totalFactsUsedInText,
        },
        error: message,
      });
      throw err;
    }

    // [5]-[6] 이벤트별: 재작성(레벨 통합 1콜) → 게이트(불합격 시 레벨별 재시도)
    // COST OPTIMIZATION: generateAndGateAll() calls llm.generateAllLevels()
    // once per event (A2+B1+B2+words in one call) instead of the old
    // once-per-level loop, and — when options.batchClient is set — submits
    // every event's initial draft as ONE Batch API round instead of
    // per-event standard calls (see pipeline/generate.ts + llm/batch.ts).
    const rewriteStart = new Date().toISOString();
    let gateFailures = 0;
    // Retry accounting. rewrite_retry is the second-largest line in the
    // cost summary, and without these the run could say how much it spent
    // regenerating but not what kept failing.
    let retriesTriggered = 0;
    const retryCauseCounts: Partial<Record<CheckKind, number>> = {};
    // Uses resolvedEventsById (post-replacement), NOT eventsToProcess — a
    // slot whose original event was dropped for insufficient corroboration
    // must resolve to its REPLACEMENT event here, or article assembly below
    // would silently reattach the dropped event's metadata (title/sources)
    // to the replacement's generated facts/content.
    const eventById = resolvedEventsById;

    try {
      const drafts = await generateAndGateAll(eventsToGenerate, {
        llm: options.llm,
        batchClient: options.batchClient,
        log,
      });

      for (const draft of drafts) {
        const event = eventById.get(draft.eventId);
        if (!event) continue;
        const generatedFacts =
          eventsToGenerate.find((e) => e.eventId === draft.eventId)?.facts ?? [];

        // Initial (pre-gate) draft — one combined generateAllLevels() call
        // covering all 3 levels for this event (batch share, or a standard
        // per-event fallback call if this event's batch request failed).
        usageLedger.record({
          stage: "rewrite",
          eventId: draft.eventId,
          tier: "opus",
          mode: draft.initialDraftMode,
          usage: draft.initialDraftUsage,
        });

        const gatedVersions: GatedVersion[] = [];
        for (const gated of draft.gatedVersions) {
          if (!gated.passed) gateFailures++;
          // Gate retries always use the standard (non-batch) rewrite() path
          // regardless of initialDraftMode — see generate.ts's NOTE on retries.
          for (const usage of gated.cefrJudgeUsages) {
            usageLedger.record({ stage: "cefr_judge", tier: "haiku", mode: "standard", usage });
          }
          for (const reasons of gated.retryReasons) {
            retriesTriggered++;
            for (const kind of reasons) {
              retryCauseCounts[kind] = (retryCauseCounts[kind] ?? 0) + 1;
            }
          }
          // Only a version that was actually regenerated gets a retry row.
          // Recording one per version regardless made the summary read
          // "rewrite_retry: 30 calls" for a run with 13 real retry calls.
          if (gated.rewriteAttempts > 1) {
            usageLedger.record({
              stage: "rewrite_retry",
              eventId: draft.eventId,
              level: gated.version.level,
              tier: "opus",
              mode: "standard",
              usage: gated.retryUsage,
            });
          }
          gatedVersions.push({
            version: gated.version,
            checks: gated.checks,
            passed: gated.passed,
            rewriteAttempts: gated.rewriteAttempts,
          });
        }

        articles.push({
          id: event.id,
          slug: slugify(gatedVersions[0]?.version.title ?? event.title, event.rankInEdition),
          category: event.category,
          rankInEdition: event.rankInEdition,
          // status='review' — human approval happens in web/ admin, never here.
          // status='held' — same human-review destination, but distinctly
          // flagged: this article failed 2-source corroboration post-rewrite
          // and must never be auto-published even partially.
          status: articleStatusForGatedVersions(gatedVersions),
          eventSummary: event.title,
          sources: event.items.map((i) => ({
            url: i.url,
            outlet: i.outlet,
            title: i.title,
            fetchMethod: "rss_summary" as const,
          })),
          facts: generatedFacts,
          versions: gatedVersions,
          createdAt: new Date().toISOString(),
        });
      }

      run.stages.push({
        stage: "rewrite",
        startedAt: rewriteStart,
        finishedAt: new Date().toISOString(),
        ok: true,
        detail: { articles: articles.length, usedBatchApi: Boolean(options.batchClient) },
      });
      run.stages.push({
        stage: "gate",
        startedAt: rewriteStart,
        finishedAt: new Date().toISOString(),
        ok: true,
        detail: {
          versionsGated: articles.length * 3,
          versionsFlaggedForHumanReview: gateFailures,
          retriesTriggered,
          retryCauses: retryCauseCounts,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.stages.push({
        stage: "rewrite",
        startedAt: rewriteStart,
        finishedAt: new Date().toISOString(),
        ok: false,
        detail: { articlesCompletedBeforeFailure: articles.length },
        error: message,
      });
      throw err;
    }

    // 저장 (status='review' — 검수 대기)
    const edition: PipelineEdition = {
      id: randomUUID(),
      editionDate,
      status: "draft",
      articles,
    };
    await stage("store", async () => {
      await options.storage.saveEdition(edition);
      return { editionDate, articles: articles.length, storage: options.storage.name };
    });

    run.articlesProduced = articles.length;
    run.status = "success";
  } catch (err) {
    run.status = "failed";
    run.errorSummary = err instanceof Error ? err.message : String(err);
  } finally {
    run.finishedAt = new Date().toISOString();

    // Cost summary is computed even on failure — tokens already spent don't
    // un-spend themselves, and a failed run's partial cost is still useful
    // for monitoring (a1 §5.3 pipeline_runs intent: visible per-stage cost).
    const byStage = usageLedger.byStage();
    run.costSummary = {
      estimatedUsd: usageLedger.totalUsd(),
      byStage: Object.fromEntries(
        Object.entries(byStage).map(([stage, bucket]) => [
          stage,
          {
            calls: bucket.calls,
            costUsd: bucket.costUsd,
            inputTokens: bucket.usage.inputTokens,
            outputTokens: bucket.usage.outputTokens,
            cacheCreationInputTokens: bucket.usage.cacheCreationInputTokens,
            cacheReadInputTokens: bucket.usage.cacheReadInputTokens,
          },
        ]),
      ),
      usedBatchApi: Boolean(options.batchClient),
    };
    log(`[pipeline] ${usageLedger.summaryLine()}`);

    // Recording the run must never mask the original failure.
    try {
      await options.storage.recordPipelineRun(run);
    } catch (recordErr) {
      log(`[pipeline] WARNING: failed to record pipeline_run: ${String(recordErr)}`);
    }
  }

  return run;
}

function summarizeStage(name: PipelineStage, result: unknown): Record<string, unknown> {
  switch (name) {
    case "collect": {
      const r = result as CollectResult;
      const bySource: Record<string, number> = {};
      for (const s of r.sourceReport) bySource[s.outlet] = s.itemCount;
      return {
        totalItems: r.items.length,
        okSources: r.sourceReport.filter((s) => s.ok).length,
        failedSources: r.sourceReport.filter((s) => !s.ok).map((s) => s.outlet),
        bySource,
      };
    }
    case "cluster": {
      const clusters = result as Array<{ items: unknown[]; outletCount: number }>;
      return {
        clusters: clusters.length,
        multiOutletClusters: clusters.filter((c) => c.outletCount >= 2).length,
      };
    }
    case "select": {
      const r = result as { selected: SelectedEvent[]; heldBack: unknown[] };
      return { selected: r.selected.length, heldBack: r.heldBack.length };
    }
    case "store":
      return result as Record<string, unknown>;
    default:
      return typeof result === "object" && result !== null
        ? (result as Record<string, unknown>)
        : {};
  }
}
