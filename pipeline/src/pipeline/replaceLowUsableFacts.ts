/**
 * [4] 재작성 전 사실 단위 검증 게이트 — extends a1-architecture.md §2 [4].
 *
 * FIX for the 2026-07-14 two-source bypass incident: selectTop10's 2-source
 * gate only checks raw `outletCount` on the CLUSTER (how many outlets
 * reported on the event at all). An event can clear that bar yet still
 * extract down to zero or one FACT that's independently confirmed by 2+
 * distinct outlets — e.g. 7 RSS items that are really just 2 distinct
 * articles ("best" list + "worst" list) each covered by several feeds/
 * mirrors, so every individual sentence ends up single-sourced after
 * sentence-level dedup in extraction. In that incident, extraction correctly
 * flagged `usedInText: false` on all 3 facts (0 usable), but nothing stopped
 * rewrite from running anyway — and the mock/real LLM rewrite step used to
 * (or, in a real LLM's case, could) draft prose from the excluded facts
 * regardless, which the two_source GATE couldn't catch because it only
 * re-checks the `usedInText` flag set at extraction, not what the generated
 * text actually contains.
 *
 * This module closes that gap at the cheapest possible point: BEFORE any
 * rewrite call is made (a1 §2 cost principle — "재작성은 비용, 실패는 최대한
 * 일찍 잡는다"). If an event's extracted facts don't clear
 * MIN_USABLE_FACTS_TO_REWRITE, it is dropped from the edition and replaced
 * with the next-best `heldBack` candidate IN THE SAME CATEGORY (so category
 * quota from selectTop10 stays intact), which is then extracted in turn.
 * Replacement is capped (MAX_REPLACEMENTS_PER_SLOT) so one exceptionally
 * thin news day can't spiral into extracting the entire heldBack pool one at
 * a time; once the cap is hit, or heldBack has no more same-category
 * candidates, the slot is left EMPTY (removed from the edition) rather than
 * silently downgrading the 2-source rule.
 *
 * Every drop/replacement/empty-slot outcome is appended to the
 * SelectionReport's `extractReplacements` log (operator-visible, same
 * spirit as selectTop10's `backfills` log) and to the `extract` pipeline_run
 * stage detail — see run.ts.
 */

import type {
  CategorySlug,
  EventCluster,
  ExtractedFact,
  ExtractReplacementLogEntry,
  SelectedEvent,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { CallUsage } from "../llm/cost.js";
import { extractFacts, usableFactCount } from "./extract.js";
import { MIN_CONFIRMED_FACTS } from "../config/thresholds.js";

/**
 * Below this many 2-source-confirmed facts, an event is not worth rewriting
 * — see module doc comment. Shared with gates/twoSource.ts via config/, so
 * the early cheap check and the final gate cannot disagree.
 */
export const MIN_USABLE_FACTS_TO_REWRITE = MIN_CONFIRMED_FACTS;

/** Caps how many times a single rank slot can be re-filled from heldBack before it's left empty. */
export const MAX_REPLACEMENTS_PER_SLOT = 2;

export interface ResolvedEvent {
  event: SelectedEvent;
  facts: ExtractedFact[];
}

export interface ResolveUsableEventsResult {
  /** Events that cleared the usable-fact bar (on the first try or after replacement), in rank order. */
  resolved: ResolvedEvent[];
  /** Log of every drop/replacement/empty-slot decision, for SelectionReport.extractReplacements + pipeline_runs. */
  log: ExtractReplacementLogEntry[];
  /** heldBack candidates NOT consumed as replacements — still available for a future run. */
  remainingHeldBack: EventCluster[];
  /** Usage of every extraction call made here, including discarded candidates. */
  extractionUsages: CallUsage[];
}

/**
 * Runs extractFacts for each selected event; when an event comes back with
 * too few usable facts, swaps it for the next-best same-category heldBack
 * candidate (extracting that one too) instead of proceeding to rewrite.
 *
 * NOTE: this makes one extractFacts() call per attempted event (original +
 * replacements), which is the intended cost trade — extraction is far
 * cheaper than a 3-level rewrite, so paying for a few extra extractions to
 * avoid wasting a rewrite call on unusable material is the point of this
 * gate (module doc comment).
 */
export async function resolveUsableEvents(
  eventsToProcess: SelectedEvent[],
  heldBack: EventCluster[],
  llm: LLMProvider,
  log: (message: string) => void = () => {},
): Promise<ResolveUsableEventsResult> {
  // Pool of not-yet-selected candidates, grouped by category, highest score
  // first is NOT guaranteed here (heldBack from selectTop10 is not sorted
  // globally) — callers that care about score order should pre-sort
  // heldBack before calling in. selectTop10's heldBack is already
  // score-agnostic (rejected + held-back-two-source mixed), so we take
  // candidates in the order given, which preserves selectTop10's own
  // category-relative ranking (heldBack is built from `scored`, itself
  // sorted by score within category, before quota filtering removed items).
  const pool = new Map<CategorySlug, EventCluster[]>();
  for (const c of heldBack) {
    const list = pool.get(c.category) ?? [];
    list.push(c);
    pool.set(c.category, list);
  }
  const consumedIds = new Set<string>();

  const replacementLog: ExtractReplacementLogEntry[] = [];
  const resolved: ResolvedEvent[] = [];
  // Every extraction attempt is a real Sonnet call — including the ones for
  // candidates that get discarded for too few usable facts. They are all
  // collected so run.ts can price the extract stage; before this, none of
  // them reached the ledger at all.
  const extractionUsages: CallUsage[] = [];

  for (const originalEvent of eventsToProcess) {
    let candidateEvent: SelectedEvent | EventCluster = originalEvent;
    let replacements = 0;
    let settled = false;
    // Usable-fact count of the ORIGINAL event's own extraction (not
    // whichever candidate is currently being tried) — this is what a
    // replacement-log entry needs to explain, so it's captured once on the
    // first (original) iteration and reused for every log entry in this slot.
    let originalUsableCount: number | null = null;

    while (!settled) {
      const { facts, usage } = await extractFacts(candidateEvent, llm);
      if (usage) extractionUsages.push(usage);
      const usable = usableFactCount(facts);
      if (originalUsableCount === null) originalUsableCount = usable;
      log(
        `[pipeline] event="${candidateEvent.title.slice(0, 50)}" facts=${facts.length} usable=${usable}`,
      );

      if (usable >= MIN_USABLE_FACTS_TO_REWRITE) {
        resolved.push({
          event: {
            ...candidateEvent,
            rankInEdition: originalEvent.rankInEdition,
            selectionRationale:
              "selectionRationale" in candidateEvent
                ? candidateEvent.selectionRationale
                : `replacement for slot ${originalEvent.rankInEdition}: ${usable} two-source-confirmed facts`,
          } as SelectedEvent,
          facts,
        });
        if (candidateEvent.id !== originalEvent.id) {
          replacementLog.push({
            slotIndex: originalEvent.rankInEdition,
            category: originalEvent.category,
            droppedClusterId: originalEvent.id,
            droppedTitle: originalEvent.title,
            usableFactCount: originalUsableCount,
            minUsableFactsRequired: MIN_USABLE_FACTS_TO_REWRITE,
            replacedByClusterId: candidateEvent.id,
            replacedByTitle: candidateEvent.title,
          });
        }
        settled = true;
        break;
      }

      // Not enough usable facts — try the next same-category heldBack candidate.
      if (replacements >= MAX_REPLACEMENTS_PER_SLOT) {
        replacementLog.push({
          slotIndex: originalEvent.rankInEdition,
          category: originalEvent.category,
          droppedClusterId: originalEvent.id,
          droppedTitle: originalEvent.title,
          usableFactCount: usable,
          minUsableFactsRequired: MIN_USABLE_FACTS_TO_REWRITE,
          replacedByClusterId: null,
          replacedByTitle: null,
          reason: `replacement cap (${MAX_REPLACEMENTS_PER_SLOT}) reached — slot left empty`,
        });
        log(
          `[pipeline] slot=${originalEvent.rankInEdition} category=${originalEvent.category} EMPTY — replacement cap reached after ${replacements} swap(s)`,
        );
        settled = true;
        break;
      }

      const candidates = pool.get(originalEvent.category) ?? [];
      const next = candidates.find((c) => !consumedIds.has(c.id) && c.id !== originalEvent.id);
      if (!next) {
        replacementLog.push({
          slotIndex: originalEvent.rankInEdition,
          category: originalEvent.category,
          droppedClusterId: candidateEvent.id,
          droppedTitle: candidateEvent.title,
          usableFactCount: usable,
          minUsableFactsRequired: MIN_USABLE_FACTS_TO_REWRITE,
          replacedByClusterId: null,
          replacedByTitle: null,
          reason: "no more heldBack candidates in this category — slot left empty",
        });
        log(
          `[pipeline] slot=${originalEvent.rankInEdition} category=${originalEvent.category} EMPTY — no heldBack candidate left`,
        );
        settled = true;
        break;
      }

      consumedIds.add(next.id);
      replacements++;
      candidateEvent = next;
    }
  }

  const remainingHeldBack = heldBack.filter((c) => !consumedIds.has(c.id));

  return { resolved, log: replacementLog, remainingHeldBack, extractionUsages };
}
