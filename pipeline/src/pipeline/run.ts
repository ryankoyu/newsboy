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
 * visible per-stage (a1 §5.3 pipeline_runs).
 *
 * RESUME (a1 §2 "어느 단계에서 죽어도 마지막 성공 지점부터 재개한다"): each
 * stage writes its output to a checkpoint keyed by edition date
 * (StorageAdapter.saveCheckpoint), and a later run for the same date picks up
 * where the failed one stopped. Rewrite checkpoints per event, not per stage —
 * it is the expensive one, and losing nine finished articles because the
 * tenth timed out is the failure this exists to prevent. The checkpoint is
 * deleted once the edition is stored; a checkpoint older than
 * CHECKPOINT_MAX_AGE_HOURS (storage/adapter.ts) is ignored rather than
 * trusted. Where the checkpoint physically lives is the adapter's call —
 * Supabase runs put it in a table so it outlives the runner.
 */

import { randomUUID } from "node:crypto";
import type {
  CollectResult,
  EventCluster,
  GatedVersion,
  PipelineArticle,
  PipelineCheckpoint,
  PipelineEdition,
  PipelineRun,
  PipelineStage,
  SelectedEvent,
  StageOutcome,
  CheckKind,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import { CHECKPOINT_MAX_AGE_HOURS } from "../storage/adapter.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { SourceConfig } from "../types.js";
import { collect } from "./collect.js";
import { clusterEvents } from "./cluster.js";
import { selectTop10 } from "./selectTop10.js";
import type { Top10Result } from "./selectTop10.js";
import type { GlobalImpactProvider } from "./globalImpact.js";
import { resolveUsableEvents, MIN_USABLE_FACTS_TO_REWRITE } from "./replaceLowUsableFacts.js";
import { generateAndGateAll } from "./generate.js";
import type { EventToGenerate, GeneratedArticleDraft } from "./generate.js";
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
  /**
   * Layer 2 글로벌 영향력 signal for the select stage
   * (pipeline/globalImpact.ts). Omitted means the signal is simply missing
   * from this run's scores, and the selection report says so.
   */
  globalImpact?: GlobalImpactProvider;
  /**
   * Resume this edition from the last checkpointed stage instead of starting
   * over (a1 §2). Defaults to true. Pass false to force a clean run — e.g.
   * when the sources themselves are suspect and re-collecting is the point.
   */
  resume?: boolean;
  log?: (message: string) => void;
}

/**
 * Slugify a title and append a uniqueness suffix.
 *
 * `articles.slug` is UNIQUE across the whole table (supabase/migrations/
 * 0001_schema.sql), and it has to stay that way: the reader route is
 * web/src/app/article/[slug] — the slug alone addresses an article, with no
 * date in the path to disambiguate.
 *
 * Rank alone is not enough for that. It separates two events inside one
 * edition, but a story that runs for several days gets a near-identical
 * rewritten title each day, and the second day's insert collides on a slug
 * the first day already took.
 *
 * So the edition date goes into the slug. What we deliberately do NOT do is
 * re-slug what is already out there: the deployed seed
 * (web/src/lib/data/seed/articles.json) uses the old `${base}-${rank}` shape,
 * e.g. "south-korea-sells-a-lot-more-to-the-world-4", and rewriting those
 * would 404 every existing link for no gain — they are already unique among
 * themselves. New articles simply get the longer, date-carrying shape, and
 * the two forms coexist without ever colliding (an old-form slug never ends
 * in an 8-digit date segment).
 *
 * `editionDate` is optional only so the pre-date form stays expressible for
 * the historical seed; runPipeline always passes it.
 */
export function slugify(title: string, rankInEdition: number, editionDate?: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || `article-${randomUUID().slice(0, 8)}`;
  if (!editionDate) return `${base}-${rankInEdition}`;
  const compactDate = editionDate.replace(/-/g, "");
  return `${base}-${compactDate}-${rankInEdition}`;
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

  /**
   * Record a stage that did not run because a checkpoint already held its
   * output. It still gets a StageOutcome — a resumed run's stage list has to
   * account for all seven stages, or "collect: missing" reads as a failure.
   */
  function resumedStage(name: PipelineStage, result: unknown): void {
    const at = new Date().toISOString();
    run.stages.push({
      stage: name,
      startedAt: at,
      finishedAt: at,
      ok: true,
      detail: { ...summarizeStage(name, result), resumedFromCheckpoint: true },
    });
    run.resumedStages = [...(run.resumedStages ?? []), name];
    log(`[pipeline] stage=${name} skipped — resumed from checkpoint`);
  }

  // Hoisted above the try so the finally-block cost summary can read it even
  // when a stage threw partway through (tokens spent before the failure are
  // still real cost).
  const usageLedger = new UsageLedger();

  // --- Resume state -------------------------------------------------------
  // Loading is best-effort: a checkpoint that can't be read costs a full
  // re-run, which is exactly what happened before checkpoints existed, so it
  // must never abort the run.
  let checkpoint: PipelineCheckpoint = {
    editionDate,
    runId: run.id,
    updatedAt: new Date().toISOString(),
  };
  if (options.resume !== false) {
    try {
      const loaded = await options.storage.loadCheckpoint(editionDate);
      if (loaded) {
        const ageHours = (Date.now() - new Date(loaded.updatedAt).getTime()) / 3600_000;
        if (Number.isFinite(ageHours) && ageHours <= CHECKPOINT_MAX_AGE_HOURS) {
          checkpoint = { ...loaded, runId: run.id };
          log(
            `[pipeline] checkpoint found for ${editionDate} (${ageHours.toFixed(1)}h old, run ${loaded.runId}) — resuming`,
          );
        } else {
          log(
            `[pipeline] checkpoint for ${editionDate} is ${ageHours.toFixed(1)}h old (> ${CHECKPOINT_MAX_AGE_HOURS}h) — starting over`,
          );
        }
      }
    } catch (err) {
      log(`[pipeline] WARNING: could not read checkpoint — starting over (${String(err)})`);
    }
  }

  async function saveCheckpoint(): Promise<void> {
    checkpoint.updatedAt = new Date().toISOString();
    try {
      await options.storage.saveCheckpoint(checkpoint);
    } catch (err) {
      // A checkpoint we failed to write only costs a future re-run.
      log(`[pipeline] WARNING: failed to write checkpoint: ${String(err)}`);
    }
  }

  try {
    // [1] 수집
    let collected: CollectResult;
    if (checkpoint.collect) {
      collected = checkpoint.collect;
      resumedStage("collect", collected);
    } else {
      collected = await stage("collect", () => collect(options.sources));
      checkpoint.collect = collected;
      await saveCheckpoint();
    }

    // [2] 클러스터링 — the single biggest reason this stage is checkpointed:
    // boundary judgments are one Haiku call per ambiguous item, thousands per
    // run (cluster.ts), and re-running them buys the same answers twice.
    let clusters: EventCluster[];
    if (checkpoint.cluster) {
      clusters = checkpoint.cluster;
      resumedStage("cluster", clusters);
    } else {
      clusters = await stage("cluster", () =>
        clusterEvents(collected.items, {
          llm: options.llm,
          onUsage: (usage) =>
            usageLedger.record({ stage: "same_event", tier: "haiku", mode: "standard", usage }),
        }),
      );
      checkpoint.cluster = clusters;
      await saveCheckpoint();
    }

    // [3] Top 10 선정 (2소스 게이트 포함)
    let top10: Top10Result;
    if (checkpoint.select) {
      top10 = checkpoint.select;
      resumedStage("select", top10);
    } else {
      top10 = await stage("select", () =>
        selectTop10(clusters, options.llm, { globalImpact: options.globalImpact, log }),
      );
      // The Layer 3 editorial call is a real Sonnet call; it went unpriced until now.
      if (top10.usage) {
        usageLedger.record({
          stage: "select",
          tier: "sonnet",
          mode: "standard",
          usage: top10.usage,
        });
      }
      // Layer 2 학습 적합성/감점 — one Haiku call for the whole candidate list.
      if (top10.learnabilityUsage) {
        usageLedger.record({
          stage: "learnability",
          tier: "haiku",
          mode: "standard",
          usage: top10.learnabilityUsage,
        });
      }
      // `usage` is deliberately not checkpointed: it prices a call this run
      // made, and a later resumed run must not re-report it as its own spend.
      checkpoint.select = {
        selected: top10.selected,
        heldBack: top10.heldBack,
        report: top10.report,
      };
      await saveCheckpoint();
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

    if (checkpoint.extract) {
      const saved = checkpoint.extract;
      eventsToGenerate.push(...saved.events);
      resolvedEventsById = new Map(saved.resolvedEvents.map((e) => [e.id, e]));
      totalFactsExtracted = saved.factsExtracted;
      totalFactsUsedInText = saved.factsUsedInText;
      resumedStage("extract", {
        eventsResolved: saved.events.length,
        factsExtracted: saved.factsExtracted,
        factsUsedInText: saved.factsUsedInText,
        extractReplacements: saved.replacements,
      });
    } else {
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

      checkpoint.extract = {
        events: eventsToGenerate,
        resolvedEvents: [...resolvedEventsById.values()],
        factsExtracted: totalFactsExtracted,
        factsUsedInText: totalFactsUsedInText,
        replacements: replacementLog,
      };
      await saveCheckpoint();
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

    /**
     * Assemble the persisted article from one generated draft. Pulled out of
     * the loop so the per-event checkpoint below stores exactly the object a
     * resumed run will reuse — not a near-copy that drifts from it.
     */
    function buildArticle(draft: GeneratedArticleDraft): PipelineArticle | null {
      const event = eventById.get(draft.eventId);
      if (!event) return null;
      const generatedFacts =
        eventsToGenerate.find((e) => e.eventId === draft.eventId)?.facts ?? [];
      const gatedVersions: GatedVersion[] = draft.gatedVersions.map((gated) => ({
        version: gated.version,
        checks: gated.checks,
        passed: gated.passed,
        rewriteAttempts: gated.rewriteAttempts,
      }));
      return {
        id: event.id,
        slug: slugify(
          gatedVersions[0]?.version.title ?? event.title,
          event.rankInEdition,
          editionDate,
        ),
        category: event.category,
        rankInEdition: event.rankInEdition,
        // status='review' — human approval happens in web/ admin, never here.
        // status='held' — same human-review destination, but distinctly
        // flagged: this article failed 2-source corroboration post-rewrite
        // and must never be auto-published even partially.
        status: articleStatusForGatedVersions(gatedVersions),
        eventSummary: event.title,
        // Snippet + outletKey/country ride along so an operator-requested
        // regeneration can rebuild the same gate inputs from the stored
        // edition alone (regenerate.ts) instead of re-collecting.
        sources: event.items.map((i) => ({
          url: i.url,
          outlet: i.outlet,
          title: i.title,
          fetchMethod: "rss_summary" as const,
          summary: i.summary,
          publishedAt: i.publishedAt,
          outletKey: i.outletKey,
          country: i.country,
        })),
        facts: generatedFacts,
        versions: gatedVersions,
        createdAt: new Date().toISOString(),
      };
    }

    // Articles a previous run of this edition already wrote and gated. They
    // are the most expensive thing the pipeline produces (one Opus call per
    // event, plus gate retries), so they are never regenerated.
    const alreadyWritten = checkpoint.articles ?? [];
    if (alreadyWritten.length > 0) {
      articles.push(...alreadyWritten);
      log(`[pipeline] ${alreadyWritten.length} article(s) restored from checkpoint — not rewritten`);
    }
    const writtenIds = new Set(alreadyWritten.map((a) => a.id));
    const eventsStillToWrite = eventsToGenerate.filter((e) => !writtenIds.has(e.eventId));

    let drafts: GeneratedArticleDraft[] = [];
    try {
      drafts = await generateAndGateAll(eventsStillToWrite, {
        llm: options.llm,
        batchClient: options.batchClient,
        log,
        // Checkpoint each event the moment it is written AND gated: a crash
        // on event 7 of 10 keeps the six drafts already paid for.
        onEventDone: async (draft) => {
          const article = buildArticle(draft);
          if (!article) return;
          checkpoint.articles = [...(checkpoint.articles ?? []), article];
          await saveCheckpoint();
        },
      });

      for (const draft of drafts) {
        const event = eventById.get(draft.eventId);
        if (!event) continue;

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
        }

        const article = buildArticle(draft);
        if (article) articles.push(article);
      }

      // Restored and freshly written articles are interleaved, so put the
      // edition back in rank order before it is stored.
      articles.sort((a, b) => a.rankInEdition - b.rankInEdition);

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

    // The edition is safely stored, so the checkpoint has nothing left to
    // protect — and leaving it would make tomorrow's rerun of this date
    // resume into work that is already done.
    try {
      await options.storage.clearCheckpoint(editionDate);
    } catch (err) {
      log(`[pipeline] WARNING: failed to clear checkpoint: ${String(err)}`);
    }

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
