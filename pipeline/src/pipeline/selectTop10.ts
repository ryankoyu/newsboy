/**
 * [3] Top 10 선정 — a1-architecture.md §2 [3].
 *
 * Two steps, matching the design:
 *  1. Apply the 2-source verification gate FIRST (news-sourcing-strategy.md
 *     §4-4: "2소스 미달이면 다음 배치로 보류") — events with only one outlet
 *     are held back, not selected, regardless of how "big" they look.
 *  2. Hand the surviving candidates to the LLMProvider for balanced Top-10
 *     ranking (global importance / Korean-reader interest / learnability +
 *     category balance, a1 §2 [3]).
 */

import type { EventCluster, SelectedEvent } from "../types.js";
import type { LLMProvider, Top10Candidate } from "../llm/provider.js";

const MIN_OUTLETS_FOR_CANDIDACY = 2;

export interface Top10Result {
  selected: SelectedEvent[];
  /** Events held back for the next batch due to insufficient corroboration. */
  heldBack: EventCluster[];
}

export async function selectTop10(
  clusters: EventCluster[],
  llm: LLMProvider,
): Promise<Top10Result> {
  const eligible = clusters.filter((c) => c.outletCount >= MIN_OUTLETS_FOR_CANDIDACY);
  const heldBack = clusters.filter((c) => c.outletCount < MIN_OUTLETS_FOR_CANDIDACY);

  if (eligible.length === 0) {
    return { selected: [], heldBack };
  }

  const candidates: Top10Candidate[] = eligible.map((c) => ({
    id: c.id,
    title: c.title,
    category: c.category,
    outletCount: c.outletCount,
    summaries: c.items.slice(0, 5).map((i) => `[${i.outlet}] ${i.title}: ${i.summary}`),
  }));

  const selections = await llm.selectTop10(candidates);
  const byId = new Map(eligible.map((c) => [c.id, c]));

  const selected: SelectedEvent[] = selections
    .filter((s) => byId.has(s.id))
    .sort((a, b) => a.rankInEdition - b.rankInEdition)
    .map((s) => {
      const cluster = byId.get(s.id)!;
      return {
        ...cluster,
        rankInEdition: s.rankInEdition,
        selectionRationale: s.rationale,
      } satisfies SelectedEvent;
    });

  // Anything not selected by the LLM (e.g. it picked <10 or referenced an
  // unknown id) is treated as held back too, not silently dropped.
  const selectedIds = new Set(selected.map((s) => s.id));
  const notSelected = eligible.filter((c) => !selectedIds.has(c.id));

  return { selected, heldBack: [...heldBack, ...notSelected] };
}
