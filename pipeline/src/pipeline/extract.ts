/**
 * [4] 사실(Fact) 추출 — a1-architecture.md §2 [4].
 *
 * Delegates extraction to the LLMProvider (role separated from rewriting per
 * A1 §3.2 — "사실 추출 프롬프트와 레벨별 재작성 프롬프트를 분리"), then enforces
 * the 2-source rule as code (not just prompt instruction) so a fact can never
 * slip through as "usedInText" without independent corroboration
 * (news-sourcing-strategy.md §2 rule #2, gate 6c).
 *
 * What "independent" counts as lives in config/outlets.ts, shared with the
 * final gate. Until 2026-08-16 this file counted distinct outlet *names*,
 * which let an aggregator link and a newsroom's own two feeds each pass as
 * two sources — see that module for the incident.
 */

import type { EventCluster, ExtractedFact, FactExtractionResult, RawItem } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import { countIndependentOutlets } from "../config/outlets.js";

const MIN_SOURCES_TO_USE = 2;

function enforceTwoSourceRule(facts: ExtractedFact[], items: readonly RawItem[]): ExtractedFact[] {
  return facts.map((f) => {
    const sourceCount = countIndependentOutlets(f.confirmedByOutlets, items);
    const meetsThreshold = sourceCount >= MIN_SOURCES_TO_USE;
    return {
      ...f,
      sourceCount,
      usedInText: f.usedInText && meetsThreshold,
      note: meetsThreshold
        ? f.note
        : f.note ??
          "single source (aggregators and sibling feeds not counted) — excluded from load-bearing text per 2-source rule",
    };
  });
}

export async function extractFacts(
  event: EventCluster,
  llm: LLMProvider,
): Promise<FactExtractionResult> {
  const { facts: rawFacts, usage } = await llm.extractFacts({
    eventId: event.id,
    category: event.category,
    title: event.title,
    items: event.items,
  });

  return {
    eventId: event.id,
    facts: enforceTwoSourceRule(rawFacts, event.items),
    usage,
  };
}

/**
 * Number of facts that survived enforceTwoSourceRule with `usedInText: true`
 * — i.e. the facts a rewrite is actually allowed to build load-bearing prose
 * from. Exported so run.ts can decide, BEFORE spending a rewrite call,
 * whether an event has enough corroborated material to be worth writing at
 * all (top10-curation.md / news-sourcing-strategy.md §2 rule #2).
 */
export function usableFactCount(facts: ExtractedFact[]): number {
  return facts.filter((f) => f.usedInText).length;
}
