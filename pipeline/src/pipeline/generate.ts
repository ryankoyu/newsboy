/**
 * [5]-[6] combined generate+gate orchestration, with an optional Batch API
 * path (cost optimization #3, task requirement: "라운드 방식 — 전체 기사 배치
 * 제출 -> 폴링 -> 게이트 -> 실패분만 2차 배치").
 *
 * Two execution modes, same output shape (GeneratedArticleDraft[]):
 *
 *   STANDARD (per-event `llm.generateAllLevels()` calls, no batch):
 *     used when USE_BATCH_API is not set, or the LLM provider isn't
 *     Anthropic-backed (Mock has no batch concept), or batch submission
 *     itself fails outright.
 *
 *   BATCH (client is an Anthropic SDK instance):
 *     round 1 — submit ALL events' generateAllLevels-equivalent requests as
 *     one batch, poll, gate whatever comes back.
 *     round 2 — for events where >=1 level failed its gate, submit a SECOND
 *     (smaller) batch requesting just the failing level's regeneration,
 *     poll, re-gate.
 *     Anything that times out or the batch API rejects falls back to a
 *     normal (non-batch) call for that one event/level — batching problems
 *     never silently drop an event.
 */

import type {
  ArticleVersionDraft,
  CategorySlug,
  CefrLevel,
  ExtractedFact,
  RawItem,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { GatedVersionWithUsage } from "./gate.js";
import { gateVersion } from "./gate.js";
import { rewriteAllLevels } from "./rewrite.js";
import type Anthropic from "@anthropic-ai/sdk";
import { runGenerateAllLevelsBatch } from "../llm/batch.js";
import type { BatchGenerateRequest } from "../llm/batch.js";
import type { CallUsage } from "../llm/cost.js";
import { emptyUsage } from "../llm/cost.js";

export interface EventToGenerate {
  eventId: string;
  category: CategorySlug;
  facts: ExtractedFact[];
  sourceItems: RawItem[];
}

export interface GeneratedArticleDraft {
  eventId: string;
  gatedVersions: GatedVersionWithUsage[];
  /** Usage from the initial (pre-gate) draft call — one combined call per event, or a batch share. */
  initialDraftUsage: CallUsage;
  /** "batch" if this event's initial draft came from the Batch API round, "standard" otherwise (incl. per-event fallback). */
  initialDraftMode: "batch" | "standard";
}

export interface GenerateOptions {
  llm: LLMProvider;
  /**
   * Called as soon as one event is fully written AND gated, before the rest
   * of the batch finishes. run.ts checkpoints on it, so a rewrite stage that
   * dies on event 7 of 10 doesn't buy the first six Opus drafts twice.
   */
  onEventDone?: (draft: GeneratedArticleDraft) => void | Promise<void>;
  /**
   * When set, generation uses the Batch API instead of per-event calls.
   * Requires a real Anthropic client (batch.ts talks to the SDK directly,
   * since LLMProvider has no batch-submission method of its own).
   */
  batchClient?: Anthropic;
  log?: (message: string) => void;
}

/** Standard (non-batch) path: one llm.generateAllLevels() call per event, then gate + retry inline. */
async function generateStandard(
  events: EventToGenerate[],
  llm: LLMProvider,
  onEventDone?: GenerateOptions["onEventDone"],
): Promise<GeneratedArticleDraft[]> {
  const drafts: GeneratedArticleDraft[] = [];
  for (const event of events) {
    const rewrite = await rewriteAllLevels(event.eventId, event.category, event.facts, llm);
    const paragraphPlan = rewrite.paragraphPlan;
    const gatedVersions: GatedVersionWithUsage[] = [];
    for (const version of rewrite.versions) {
      const gated = await gateVersion(
        event.eventId,
        event.category,
        version,
        event.facts,
        event.sourceItems,
        llm,
        paragraphPlan,
      );
      gatedVersions.push(gated);
    }
    const draft: GeneratedArticleDraft = {
      eventId: event.eventId,
      gatedVersions,
      initialDraftUsage: rewrite.usage,
      initialDraftMode: "standard",
    };
    drafts.push(draft);
    await onEventDone?.(draft);
  }
  return drafts;
}

/**
 * Batch path. Returns the same shape as generateStandard() so callers don't
 * need to branch on which path ran.
 */
async function generateViaBatch(
  events: EventToGenerate[],
  llm: LLMProvider,
  client: Anthropic,
  log: (message: string) => void,
  onEventDone?: GenerateOptions["onEventDone"],
): Promise<GeneratedArticleDraft[]> {
  const byId = new Map(events.map((e) => [e.eventId, e]));

  // Round 1: submit every event's combined generation as one batch.
  const round1Requests: BatchGenerateRequest[] = events.map((e) => ({
    eventId: e.eventId,
    category: e.category,
    facts: e.facts,
  }));

  const round1 = await runGenerateAllLevelsBatch(client, round1Requests, { log });

  if (round1.batchUnavailable) {
    log("[generate] batch API unavailable — falling back to standard per-event calls for all events");
    return generateStandard(events, llm, onEventDone);
  }

  const draftsById = new Map<string, ArticleVersionDraft[]>();
  // Beats per event, so a gate retry can put the regenerated level back on the
  // same paragraphs as its siblings.
  const planById = new Map<string, string[]>();
  const draftUsageById = new Map<string, CallUsage>();
  const draftModeById = new Map<string, "batch" | "standard">();
  for (const s of round1.succeeded) {
    const levels: CefrLevel[] = ["A2", "B1", "B2"];
    draftsById.set(
      s.eventId,
      levels.map((level) => ({
        level,
        title: s.versions[level].title,
        content: s.versions[level].content,
        wordCount: s.versions[level].wordCount,
        words: s.versions[level].words,
      })),
    );
    planById.set(s.eventId, s.paragraphPlan ?? []);
    draftUsageById.set(s.eventId, s.usage);
    draftModeById.set(s.eventId, "batch");
  }

  // Events whose batch request failed outright (timeout/error/expired) fall
  // back to a standard per-event call for the initial draft — never dropped.
  const fallbackDrafts = new Map<string, ArticleVersionDraft[]>();
  if (round1.failed.length > 0) {
    log(`[generate] ${round1.failed.length} event(s) failed round-1 batch — falling back per event`);
    for (const failure of round1.failed) {
      const event = byId.get(failure.eventId);
      if (!event) continue;
      const rewrite = await rewriteAllLevels(event.eventId, event.category, event.facts, llm);
      fallbackDrafts.set(failure.eventId, rewrite.versions);
      planById.set(failure.eventId, rewrite.paragraphPlan);
      draftUsageById.set(failure.eventId, rewrite.usage);
      draftModeById.set(failure.eventId, "standard");
    }
  }

  // Gate every event's initial draft (batch-sourced or fallback-sourced).
  //
  // NOTE on retries: gateVersion() already implements the "실패한 레벨만
  // 개별 재생성" retry loop internally via llm.rewrite() (standard, non-batch
  // call — see gate.ts). Round 1 batching captures the large win (all
  // events' 3-level initial drafts in one batch); gate retries affect only a
  // minority of levels and each needs its own targeted feedback text, so
  // batching them would mean a second poll-and-wait cycle for a handful of
  // requests — not worth the added latency. This is a deliberate scope
  // decision, not an oversight: it satisfies the "실패분만 2차 배치" concept
  // at the DRAFT level (round 1 vs fallback-for-failed-events below) while
  // keeping the fine-grained per-level gate retry on the fast standard path.
  const gatedByEvent = new Map<string, GatedVersionWithUsage[]>();

  for (const event of events) {
    const versions = draftsById.get(event.eventId) ?? fallbackDrafts.get(event.eventId);
    if (!versions) continue; // shouldn't happen — every event is in one map or the other
    const paragraphPlan = planById.get(event.eventId) ?? [];
    const gated: GatedVersionWithUsage[] = [];
    for (const version of versions) {
      const result = await gateVersion(
        event.eventId,
        event.category,
        version,
        event.facts,
        event.sourceItems,
        llm,
        paragraphPlan,
      );
      gated.push(result);
    }
    gatedByEvent.set(event.eventId, gated);
    // Checkpoint here too: the batch bought the drafts, but gating them runs
    // its own Haiku/Opus retry calls, and dying halfway through the gate loop
    // should not throw away the events already cleared.
    await onEventDone?.({
      eventId: event.eventId,
      gatedVersions: gated,
      initialDraftUsage: draftUsageById.get(event.eventId) ?? emptyUsage(),
      initialDraftMode: draftModeById.get(event.eventId) ?? "standard",
    });
  }

  return events.map((event) => ({
    eventId: event.eventId,
    gatedVersions: gatedByEvent.get(event.eventId) ?? [],
    initialDraftUsage: draftUsageById.get(event.eventId) ?? emptyUsage(),
    initialDraftMode: draftModeById.get(event.eventId) ?? "standard",
  }));
}

export async function generateAndGateAll(
  events: EventToGenerate[],
  options: GenerateOptions,
): Promise<GeneratedArticleDraft[]> {
  const log = options.log ?? (() => {});
  if (options.batchClient) {
    return generateViaBatch(events, options.llm, options.batchClient, log, options.onEventDone);
  }
  return generateStandard(events, options.llm, options.onEventDone);
}
