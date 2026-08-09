/**
 * [3] Top 10 선정 — a1-architecture.md §2 [3], top10-curation.md §1.
 *
 * Rewritten per top10-curation.md's diagnosis of the 2026-07-13 US-politics
 * skew (World 3/5 slots were US Congress stories). The selection algorithm
 * itself now CODE-ENFORCES Layer 1 hard rules — it does not trust an LLM (or
 * a raw outlet-count sort) to keep balance on its own:
 *
 *   1. 2-source gate (source-deduped by outletKey — see cluster.ts).
 *   2. Layer 2 composite score (score.ts) ranks candidates within each
 *      category — media diversity + Korea relevance + freshness.
 *   3. Layer 1 greedy selection with a FIXED category quota
 *      (world 3 / korea 2 / ai-tech 2 / business 2 / culture-sports 1),
 *      same-country-politics cap (max 2), duplicate-subject exclusion,
 *      world regional spread, and a tone/casualty cap with a guaranteed
 *      non-casualty last slot.
 *   4. Every candidate's fate (selected/backfilled/rejected/held-back) is
 *      recorded into a SelectionReport for operator review.
 *
 * The LLM is used only for `selectionRationale` (natural-language "why"
 * text) on the already-decided ranking — never for the ranking itself. This
 * matches the design's "AI는 제안, 룰은 강제" principle one step further:
 * for now Layer 1 rules decide outright, since Layer 3 (LLM editorial
 * meeting) is future work (top10-curation.md §1 Layer 3 / §4 roadmap step 2).
 */

import type {
  BackfillLogEntry,
  CandidateReportEntry,
  CategorySlug,
  EventCluster,
  SelectedEvent,
  SelectionReport,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import { scoreCluster } from "./score.js";
import {
  clusterSubjectKey,
  isCasualtyStory,
  isPoliticalStory,
  politicalCountryGuess,
  regionOf,
} from "./rules.js";

const MIN_OUTLETS_FOR_CANDIDACY = 2;

/** Fixed category quota — top10-curation.md §1 Layer 1 "카테고리 쿼터 고정". */
export const CATEGORY_QUOTA: Record<CategorySlug, number> = {
  world: 3,
  korea: 2,
  "ai-tech": 2,
  business: 2,
  "culture-sports": 1,
};

/** Backfill priority when a category runs short — adjacent categories first, per §1 "world 몰아주기 금지". */
const BACKFILL_ADJACENCY: Record<CategorySlug, CategorySlug[]> = {
  world: ["korea", "business"],
  korea: ["world", "business"],
  "ai-tech": ["business", "world"],
  business: ["ai-tech", "world"],
  "culture-sports": ["korea", "world"],
};

const MAX_SAME_COUNTRY_POLITICS = 2;
const MAX_SAME_COUNTRY_WORLD = 2;
const MAX_CASUALTY_STORIES = 5;
const TOTAL_SLOTS = 10;

export interface Top10Result {
  selected: SelectedEvent[];
  /** Events held back for the next batch due to insufficient corroboration. */
  heldBack: EventCluster[];
  /** Full rule-application record for operator review (top10-curation.md §1 Layer 1). */
  report: SelectionReport;
}

interface ScoredCandidate {
  cluster: EventCluster;
  score: number;
  scoreBreakdown: Record<string, number>;
  isPolitical: boolean;
  isCasualty: boolean;
  subjectKey: string | null;
  countryGuess: string | null;
}

function buildScoredCandidates(clusters: EventCluster[], now: Date): ScoredCandidate[] {
  return clusters.map((cluster) => {
    const breakdown = scoreCluster(cluster, now);
    return {
      cluster,
      score: breakdown.total,
      scoreBreakdown: {
        sourceDiversity: breakdown.sourceDiversity,
        countryDiversity: breakdown.countryDiversity,
        koreaRelevance: breakdown.koreaRelevance,
        freshness: breakdown.freshness,
        total: breakdown.total,
      },
      isPolitical: isPoliticalStory(cluster),
      isCasualty: isCasualtyStory(cluster),
      subjectKey: clusterSubjectKey(cluster),
      countryGuess: politicalCountryGuess(cluster),
    };
  });
}

/**
 * Greedy, quota-respecting, rule-enforcing selection over already-scored,
 * already-2-source-filtered candidates. Returns the chosen clusters in rank
 * order (1..N) plus a full per-candidate report.
 */
function runLayer1Selection(
  scored: ScoredCandidate[],
  now: Date,
): { chosen: ScoredCandidate[]; report: Omit<SelectionReport, "editionDate" | "generatedAt"> } {
  const byCategory = new Map<CategorySlug, ScoredCandidate[]>();
  for (const c of scored) {
    const list = byCategory.get(c.cluster.category) ?? [];
    list.push(c);
    byCategory.set(c.cluster.category, list);
  }
  for (const list of byCategory.values()) {
    list.sort((a, b) => b.score - a.score);
  }

  const chosen: ScoredCandidate[] = [];
  const chosenIds = new Set<string>();
  const usedSubjectKeys = new Set<string>();
  const politicsCountByCountry = new Map<string, number>();
  const worldCountByCountry = new Map<string, number>();
  const backfills: BackfillLogEntry[] = [];
  const rejectionReasons = new Map<string, string[]>();

  function addRejection(id: string, reason: string): void {
    const list = rejectionReasons.get(id) ?? [];
    list.push(reason);
    rejectionReasons.set(id, list);
  }

  /**
   * Tries to admit `candidate`, checking every Layer 1 hard rule EXCEPT the
   * tone/casualty cap (applied globally in a second pass below, since it
   * depends on the final 10 as a set, not per-category quota filling).
   */
  function tryAdmit(candidate: ScoredCandidate): boolean {
    if (chosenIds.has(candidate.cluster.id)) return false;

    // Duplicate-subject exclusion.
    if (candidate.subjectKey && usedSubjectKeys.has(candidate.subjectKey)) {
      addRejection(
        candidate.cluster.id,
        `duplicate subject "${candidate.subjectKey}" already selected`,
      );
      return false;
    }

    // Same-country politics cap.
    if (candidate.isPolitical && candidate.countryGuess) {
      const count = politicsCountByCountry.get(candidate.countryGuess) ?? 0;
      if (count >= MAX_SAME_COUNTRY_POLITICS) {
        addRejection(
          candidate.cluster.id,
          `country "${candidate.countryGuess}" already has ${MAX_SAME_COUNTRY_POLITICS} political stories selected`,
        );
        return false;
      }
    }

    // World-slot same-country cap (regional spread).
    if (candidate.cluster.category === "world" && candidate.countryGuess) {
      const count = worldCountByCountry.get(candidate.countryGuess) ?? 0;
      if (count >= MAX_SAME_COUNTRY_WORLD) {
        addRejection(
          candidate.cluster.id,
          `world country "${candidate.countryGuess}" already has ${MAX_SAME_COUNTRY_WORLD} stories selected`,
        );
        return false;
      }
    }

    chosen.push(candidate);
    chosenIds.add(candidate.cluster.id);
    if (candidate.subjectKey) usedSubjectKeys.add(candidate.subjectKey);
    if (candidate.isPolitical && candidate.countryGuess) {
      politicsCountByCountry.set(
        candidate.countryGuess,
        (politicsCountByCountry.get(candidate.countryGuess) ?? 0) + 1,
      );
    }
    if (candidate.cluster.category === "world" && candidate.countryGuess) {
      worldCountByCountry.set(
        candidate.countryGuess,
        (worldCountByCountry.get(candidate.countryGuess) ?? 0) + 1,
      );
    }
    return true;
  }

  // --- Pass 1: fill each category's own quota from its own candidates ------
  for (const [category, quota] of Object.entries(CATEGORY_QUOTA) as [CategorySlug, number][]) {
    const list = byCategory.get(category) ?? [];
    const filled =
      category === "world"
        ? fillWorldQuotaWithRegionSpread(list, quota, tryAdmit, chosenIds)
        : fillQuotaByScore(list, quota, tryAdmit);

    if (filled < quota) {
      for (let slot = filled + 1; slot <= quota; slot++) {
        backfills.push({
          category,
          slotIndex: slot,
          reason: `only ${filled} of ${quota} candidates available/admissible in "${category}" after Layer 1 rules`,
          filledFrom: null,
          filledByClusterId: null,
        });
      }
    }
  }

  // --- Pass 2: backfill unfilled quota slots from adjacent categories -------
  // (top10-curation.md §1: "인접 카테고리" — never dump everything into world).
  for (const entry of backfills) {
    if (chosen.length >= TOTAL_SLOTS) break;
    const adjacents = BACKFILL_ADJACENCY[entry.category];
    let filledFromHere: CategorySlug | null = null;
    let filledId: string | null = null;
    for (const adjCategory of adjacents) {
      const list = byCategory.get(adjCategory) ?? [];
      const pick = list.find((c) => !chosenIds.has(c.cluster.id) && tryAdmit(c));
      if (pick) {
        filledFromHere = adjCategory;
        filledId = pick.cluster.id;
        break;
      }
    }
    entry.filledFrom = filledFromHere;
    entry.filledByClusterId = filledId;
    if (!filledFromHere) {
      entry.reason += "; no admissible candidate found in adjacent categories either";
    }
  }

  // --- Pass 3: if still short of 10 (rare — quota rules blocked candidates
  // that existed), fill from any remaining eligible candidate by score. -----
  if (chosen.length < TOTAL_SLOTS) {
    const remaining = scored
      .filter((c) => !chosenIds.has(c.cluster.id))
      .sort((a, b) => b.score - a.score);
    for (const candidate of remaining) {
      if (chosen.length >= TOTAL_SLOTS) break;
      if (tryAdmit(candidate)) {
        backfills.push({
          category: candidate.cluster.category,
          slotIndex: -1,
          reason: `final cross-category backfill to reach ${TOTAL_SLOTS} total (all quota/adjacency options exhausted)`,
          filledFrom: candidate.cluster.category,
          filledByClusterId: candidate.cluster.id,
        });
      }
    }
  }

  // --- Rank ordering: quota is filled by category, but within the final 10
  // rank by score desc so the most important stories lead the edition. ------
  chosen.sort((a, b) => b.score - a.score);

  // --- Tone/casualty balance: cap casualty stories at MAX_CASUALTY_STORIES,
  // and guarantee the LAST slot (rank 10) is non-casualty. -------------------
  applyToneBalance(chosen, scored, chosenIds, addRejection);

  const finalOrder = chosen.map((c) => c.cluster.id);

  const candidateEntries: CandidateReportEntry[] = scored.map((c) => {
    const rank = finalOrder.indexOf(c.cluster.id);
    const backfillHit = backfills.find((b) => b.filledByClusterId === c.cluster.id);
    let outcome: CandidateReportEntry["outcome"];
    if (rank >= 0) {
      outcome = backfillHit ? "backfilled" : "selected";
    } else {
      outcome = "rejected";
    }
    return {
      id: c.cluster.id,
      title: c.cluster.title,
      category: c.cluster.category,
      outletCount: c.cluster.outletCount,
      outletKeys: c.cluster.outletKeys,
      countries: c.cluster.countries,
      score: c.score,
      scoreBreakdown: c.scoreBreakdown,
      isPolitical: c.isPolitical,
      isCasualty: c.isCasualty,
      subjectKey: c.subjectKey,
      outcome,
      rank: rank >= 0 ? rank + 1 : null,
      rejectionReasons: rejectionReasons.get(c.cluster.id) ?? [],
    };
  });

  return {
    chosen,
    report: {
      quota: CATEGORY_QUOTA,
      candidates: candidateEntries,
      backfills,
      finalOrder,
      limitations: LAYER1_LIMITATIONS,
    },
  };
}

/** Plain best-score-first quota fill — used for every non-"world" category. */
function fillQuotaByScore(
  list: ScoredCandidate[],
  quota: number,
  tryAdmit: (candidate: ScoredCandidate) => boolean,
): number {
  let filled = 0;
  for (const candidate of list) {
    if (filled >= quota) break;
    if (tryAdmit(candidate)) filled++;
  }
  return filled;
}

/**
 * World-quota fill with regional spread — top10-curation.md §1 Layer 1
 * "World 3건은 지역 분산 지향: 가능하면 서로 다른 지역(아메리카/유럽/아시아·중동/기타)에서."
 * This is a soft preference ("지향"), not a hard cap like the same-country
 * politics rule: for each open world slot, prefer the highest-scored
 * remaining candidate whose region (rules.ts regionOf, keyed off the same
 * countryGuess proxy already used for the same-country World cap) hasn't
 * been used yet by an already-admitted world story; only fall back to the
 * plain highest-scored remaining candidate once every represented region is
 * already covered (or the candidate has no country signal at all, bucketed
 * into "other" — see regionOf doc comment for that limitation).
 */
function fillWorldQuotaWithRegionSpread(
  list: ScoredCandidate[],
  quota: number,
  tryAdmit: (candidate: ScoredCandidate) => boolean,
  chosenIds: Set<string>,
): number {
  let filled = 0;
  const usedRegions = new Set<string>();
  let remaining = list.filter((c) => !chosenIds.has(c.cluster.id));

  while (filled < quota && remaining.length > 0) {
    const fromNewRegion = remaining.find(
      (c) => !usedRegions.has(regionOf(c.countryGuess ?? "")),
    );
    const candidate = fromNewRegion ?? remaining[0];

    remaining = remaining.filter((c) => c.cluster.id !== candidate.cluster.id);
    if (tryAdmit(candidate)) {
      filled++;
      usedRegions.add(regionOf(candidate.countryGuess ?? ""));
    }
  }
  return filled;
}

/**
 * Enforces the tone/casualty rule on the already-ranked `chosen` list:
 *   - at most MAX_CASUALTY_STORIES casualty-tagged stories total
 *   - the last slot (rank 10, or the last slot if fewer than 10 total) must
 *     be a non-casualty story
 * Swaps in the next-best non-casualty/non-selected candidate when a
 * violation is found, rather than just dropping a slot — preserves 10 total
 * whenever a substitute exists.
 */
function applyToneBalance(
  chosen: ScoredCandidate[],
  allScored: ScoredCandidate[],
  chosenIds: Set<string>,
  addRejection: (id: string, reason: string) => void,
): void {
  function findReplacement(excludeCasualty: boolean): ScoredCandidate | undefined {
    return allScored
      .filter((c) => !chosenIds.has(c.cluster.id))
      .filter((c) => (excludeCasualty ? !c.isCasualty : true))
      .sort((a, b) => b.score - a.score)[0];
  }

  // Rule: total casualty count capped.
  let casualtyIndices = chosen
    .map((c, idx) => (c.isCasualty ? idx : -1))
    .filter((idx) => idx >= 0);
  while (casualtyIndices.length > MAX_CASUALTY_STORIES) {
    // Replace the LOWEST-scored casualty story first (least impact on ranking quality).
    const worstIdx = casualtyIndices[casualtyIndices.length - 1];
    const removed = chosen[worstIdx];
    const replacement = findReplacement(true);
    if (!replacement) break; // no non-casualty candidate left — accept the overage
    addRejection(
      removed.cluster.id,
      `swapped out for tone balance: casualty-story cap (${MAX_CASUALTY_STORIES}) exceeded`,
    );
    chosenIds.delete(removed.cluster.id);
    chosenIds.add(replacement.cluster.id);
    chosen[worstIdx] = replacement;
    chosen.sort((a, b) => b.score - a.score);
    casualtyIndices = chosen.map((c, idx) => (c.isCasualty ? idx : -1)).filter((idx) => idx >= 0);
  }

  // Rule: last slot must be non-casualty.
  const lastIdx = chosen.length - 1;
  if (lastIdx >= 0 && chosen[lastIdx].isCasualty) {
    // Find the lowest-ranked NON-casualty story already selected and swap
    // positions with it (keeps the same 10 stories, just reorders), unless
    // every selected story is a casualty story (extreme edge case) — then
    // pull in a fresh non-casualty replacement instead.
    const nonCasualtyIdx = [...chosen.keys()].reverse().find((i) => !chosen[i].isCasualty);
    if (nonCasualtyIdx !== undefined && nonCasualtyIdx !== lastIdx) {
      const tmp = chosen[lastIdx];
      chosen[lastIdx] = chosen[nonCasualtyIdx];
      chosen[nonCasualtyIdx] = tmp;
    } else {
      const replacement = findReplacement(true);
      if (replacement) {
        addRejection(
          chosen[lastIdx].cluster.id,
          "swapped out of last slot: last slot must be a non-casualty story",
        );
        chosenIds.delete(chosen[lastIdx].cluster.id);
        chosenIds.add(replacement.cluster.id);
        chosen[lastIdx] = replacement;
      }
    }
  }
}

const LAYER1_LIMITATIONS = [
  "Political-story detection is an English keyword heuristic (see rules.ts POLITICAL_KEYWORDS) — misses non-keyword framings and non-English phrasing; false negatives more likely than false positives.",
  "Political story's \"country\" is the REPORTING OUTLET's country/edition, not a verified subject-country (a US outlet can report on non-US politics) — see rules.ts politicalCountryGuess doc comment.",
  "Duplicate-subject detection uses a capitalized-word-run regex over the title, not named-entity recognition — can miss lowercase subjects, conflate distinct people sharing a capitalized lead word, or miss pronoun co-reference.",
  "Casualty/tone detection is an English keyword heuristic (see rules.ts CASUALTY_KEYWORDS) — a story can discuss death/conflict without these exact words, or use them in a non-casualty sense.",
  "Layer 2 score does not yet include LLM-only signals (learnability, demerit/sensationalism) — LLMProvider.scoreLearnabilityAndDemerit is a stub, not called (top10-curation.md §1 Layer 2 roadmap).",
  "No Layer 3 LLM editorial pass runs yet — Layer 1 rules decide the final ranking outright rather than validating an LLM proposal.",
];

export async function selectTop10(
  clusters: EventCluster[],
  llm: LLMProvider,
): Promise<Top10Result> {
  const now = new Date();
  const eligible = clusters.filter((c) => c.outletCount >= MIN_OUTLETS_FOR_CANDIDACY);
  const heldBackTwoSource = clusters.filter((c) => c.outletCount < MIN_OUTLETS_FOR_CANDIDACY);

  const editionDate = now.toISOString().slice(0, 10);

  if (eligible.length === 0) {
    return {
      selected: [],
      heldBack: heldBackTwoSource,
      report: {
        editionDate,
        generatedAt: now.toISOString(),
        quota: CATEGORY_QUOTA,
        candidates: heldBackTwoSource.map((c) => ({
          id: c.id,
          title: c.title,
          category: c.category,
          outletCount: c.outletCount,
          outletKeys: c.outletKeys,
          countries: c.countries,
          score: 0,
          scoreBreakdown: {},
          isPolitical: false,
          isCasualty: false,
          subjectKey: null,
          outcome: "held_back_two_source",
          rank: null,
          rejectionReasons: ["fewer than 2 deduped sources"],
        })),
        backfills: [],
        finalOrder: [],
        limitations: LAYER1_LIMITATIONS,
      },
    };
  }

  const scored = buildScoredCandidates(eligible, now);
  const { chosen, report: partialReport } = runLayer1Selection(scored, now);

  // Rationale text: ask the LLM for a natural-language "why" per selected
  // item, but the ranking itself is already final — this call cannot change
  // which stories were picked or their order (see module doc comment).
  let rationales = new Map<string, string>();
  try {
    const candidatesForLlm = chosen.map((c) => ({
      id: c.cluster.id,
      title: c.cluster.title,
      category: c.cluster.category,
      outletCount: c.cluster.outletCount,
      summaries: c.cluster.items.slice(0, 5).map((i) => `[${i.outlet}] ${i.title}: ${i.summary}`),
    }));
    const llmSelections = await llm.selectTop10(candidatesForLlm);
    rationales = new Map(llmSelections.map((s) => [s.id, s.rationale]));
  } catch {
    // Rationale text is a nice-to-have narration, not load-bearing — if the
    // LLM call fails for any reason, fall back to a rule-derived rationale
    // below rather than failing selection entirely.
  }

  const selected: SelectedEvent[] = chosen.map((c, idx) => ({
    ...c.cluster,
    rankInEdition: idx + 1,
    selectionRationale:
      rationales.get(c.cluster.id) ??
      `score=${c.score.toFixed(2)} (sources=${c.cluster.outletCount}, countries=${c.cluster.countries.length}${c.cluster.countries.includes("KR") ? ", KR-relevant" : ""}), category=${c.cluster.category}`,
  }));

  const chosenIds = new Set(chosen.map((c) => c.cluster.id));
  const notSelectedEligible = eligible.filter((c) => !chosenIds.has(c.id));

  return {
    selected,
    heldBack: [...heldBackTwoSource, ...notSelectedEligible],
    report: {
      editionDate,
      generatedAt: now.toISOString(),
      ...partialReport,
    },
  };
}
