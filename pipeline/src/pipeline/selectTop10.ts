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
 *      category — media diversity + Korea relevance + freshness + GDELT
 *      global reach (globalImpact.ts) + LLM learnability/demerit.
 *   3. Layer 3 편집회의: the top LAYER3_POOL_SIZE candidates by score go to
 *      the LLM, which proposes its own ten with reasons. The proposal is a
 *      PREFERENCE ORDER, not a decision — it reorders the candidate list
 *      that Layer 1 then fills the quota from.
 *   4. Layer 1 greedy selection with a FIXED category quota
 *      (world 3 / korea 2 / ai-tech 2 / business 2 / culture-sports 1),
 *      same-country-politics cap (max 2), duplicate-subject exclusion,
 *      world regional spread, and a tone/casualty cap with a guaranteed
 *      non-casualty last slot.
 *   5. Every candidate's fate (selected/backfilled/rejected/held-back), its
 *      score breakdown and the LLM's proposed rank are recorded into a
 *      SelectionReport for operator review.
 *
 * "AI는 제안, 룰은 강제" is enforced structurally, not by good intentions:
 * the LLM only supplies an ordering over candidates that have ALREADY passed
 * the 2-source gate, and every quota, cap and tone rule runs afterwards on
 * its proposal. An LLM that proposes ten US-politics stories still gets a
 * balanced ten back out, and the report shows where its picks were overruled.
 *
 * Every external signal is optional and fails soft. GDELT down, no
 * scoreLearnabilityAndDemerit on the provider, a rejected editorial call —
 * each degrades this to the rules-only behaviour it had before, never to a
 * failed run: selection is on the critical path for the whole edition.
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
import type { CallUsage } from "../llm/cost.js";
import { computeLeadScore } from "./leadScore.js";
import { scoreCluster } from "./score.js";
import type { ExternalSignals } from "./score.js";
import { normalizeGlobalImpact } from "./globalImpact.js";
import type { GlobalImpactProvider } from "./globalImpact.js";
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

/**
 * How many top-scored candidates go to the Layer 3 editorial call
 * (top10-curation.md §1 Layer 3: "점수 상위 25~30 후보"). Everything below
 * this rank was not going to survive the quota anyway, and sending it would
 * only dilute the model's attention.
 */
const LAYER3_POOL_SIZE = 28;

/** Cap on the Layer 2 learnability call's input, for the same reason. */
const LEARNABILITY_POOL_SIZE = 40;

export interface Top10Options {
  /**
   * Gathers the GDELT global-reach signal for the surviving candidates
   * (globalImpact.ts). Omitted in tests and demo runs — the pipeline must
   * not depend on a third-party endpoint to select an edition.
   */
  globalImpact?: GlobalImpactProvider;
  log?: (message: string) => void;
}

export interface Top10Result {
  selected: SelectedEvent[];
  /** Usage of the Sonnet Layer 3 editorial call, when one was made. */
  usage?: CallUsage;
  /** Usage of the Haiku Layer 2 learnability/demerit call, when one was made. */
  learnabilityUsage?: CallUsage;
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
  /** Rank the Layer 3 editorial call gave this candidate, if it named it. */
  llmProposedRank: number | null;
}

function buildScoredCandidates(
  clusters: EventCluster[],
  now: Date,
  externalById: Map<string, ExternalSignals> = new Map(),
): ScoredCandidate[] {
  return clusters.map((cluster) => {
    const breakdown = scoreCluster(cluster, now, externalById.get(cluster.id) ?? {});
    return {
      cluster,
      score: breakdown.total,
      scoreBreakdown: {
        sourceDiversity: breakdown.sourceDiversity,
        countryDiversity: breakdown.countryDiversity,
        koreaRelevance: breakdown.koreaRelevance,
        freshness: breakdown.freshness,
        globalImpact: breakdown.globalImpact,
        learnability: breakdown.learnability,
        demerit: breakdown.demerit,
        total: breakdown.total,
      },
      isPolitical: isPoliticalStory(cluster),
      isCasualty: isCasualtyStory(cluster),
      subjectKey: clusterSubjectKey(cluster),
      countryGuess: politicalCountryGuess(cluster),
      llmProposedRank: null,
    };
  });
}

/**
 * Candidate preference order: the Layer 3 editorial proposal first, the
 * Layer 2 score for everything it did not name.
 *
 * This is the ONLY place the LLM's opinion enters selection. It decides who
 * is considered first for a slot; it cannot create a slot, exceed a quota, or
 * clear a cap — those run afterwards in tryAdmit(), unchanged.
 */
function byEditorialPreference(a: ScoredCandidate, b: ScoredCandidate): number {
  const ra = a.llmProposedRank ?? Number.POSITIVE_INFINITY;
  const rb = b.llmProposedRank ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return b.score - a.score;
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
    list.sort(byEditorialPreference);
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
      .sort(byEditorialPreference);
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

  // --- Rank ordering: the quota decides WHICH ten run; leadScore decides
  // which of them leads. Ordering by the selection score put the freshest
  // Korea-tagged item on the front page regardless of reach or stakes — see
  // leadScore.ts for the 2026-07-13 evidence. Selection itself is unchanged.
  sortForFrontPage(chosen, now);

  // --- Tone/casualty balance: cap casualty stories at MAX_CASUALTY_STORIES,
  // and guarantee the LAST slot (rank 10) is non-casualty. -------------------
  applyToneBalance(chosen, scored, chosenIds, addRejection, now);

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
      // Lets the operator see where the rules overruled the editorial call:
      // llmProposedRank 2 with outcome 'rejected' is a quota or cap doing
      // its job, and it should be visible rather than inferred.
      llmProposedRank: c.llmProposedRank,
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
/**
 * Order the chosen ten for the front page. Sorts in place so the existing
 * tone-balance logic, which indexes into this array, keeps working.
 */
function sortForFrontPage(chosen: ScoredCandidate[], now: Date): void {
  const lead = new Map(chosen.map((c) => [c.cluster.id, computeLeadScore(c.cluster, now).total]));
  chosen.sort(
    (a, b) =>
      (lead.get(b.cluster.id) ?? 0) - (lead.get(a.cluster.id) ?? 0) || b.score - a.score,
  );
}

function applyToneBalance(
  chosen: ScoredCandidate[],
  allScored: ScoredCandidate[],
  chosenIds: Set<string>,
  addRejection: (id: string, reason: string) => void,
  now: Date,
): void {
  function findReplacement(excludeCasualty: boolean): ScoredCandidate | undefined {
    return allScored
      .filter((c) => !chosenIds.has(c.cluster.id))
      .filter((c) => (excludeCasualty ? !c.isCasualty : true))
      .sort(byEditorialPreference)[0];
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
    sortForFrontPage(chosen, now);
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
  "The Layer 3 editorial proposal only reorders candidates — it can never add a story that failed the 2-source gate, exceed a quota, or clear a cap. Where scoreBreakdown and llmProposedRank disagree with the outcome, a Layer 1 rule overruled the AI.",
];

/** Appended to the report when a signal that should have been gathered was not. */
const SIGNAL_LIMITATION = {
  globalImpact:
    "Layer 2 글로벌 영향력 (GDELT) signal is missing from this run's scores — no provider was configured, or every query failed. Reach across national media lines went unmeasured.",
  learnability:
    "Layer 2 학습 적합성/감점 signal is missing from this run's scores — the LLM provider does not implement scoreLearnabilityAndDemerit, or the call failed.",
  layer3:
    "Layer 3 편집회의 did not run for this edition (call skipped or failed) — the Layer 2 score alone ordered the candidates.",
} as const;

/**
 * Layer 2 external signals for the surviving candidates: GDELT global reach
 * and the LLM's learnability/demerit judgment.
 *
 * Both are gathered once for the whole candidate list, and both fail soft —
 * an unavailable signal means "no signal" (scored 0, i.e. neutral), never a
 * failed selection. What is NOT silent is the fact that it was missing: the
 * report gets a limitation line, because a score computed from four signals
 * instead of six should not look identical to one computed from six.
 */
async function gatherExternalSignals(
  eligible: EventCluster[],
  llm: LLMProvider,
  options: Top10Options,
): Promise<{
  byId: Map<string, ExternalSignals>;
  usage?: CallUsage;
  limitations: string[];
}> {
  const log = options.log ?? (() => {});
  const byId = new Map<string, ExternalSignals>();
  const limitations: string[] = [];
  const set = (id: string, patch: ExternalSignals) =>
    byId.set(id, { ...(byId.get(id) ?? {}), ...patch });

  // 글로벌 영향력 — GDELT country reach.
  if (options.globalImpact) {
    try {
      const signals = await options.globalImpact(eligible);
      if (signals.size === 0) {
        limitations.push(SIGNAL_LIMITATION.globalImpact);
      } else {
        for (const [clusterId, signal] of signals) {
          set(clusterId, { globalImpact: normalizeGlobalImpact(signal) });
        }
      }
    } catch (err) {
      log(`[select] global-impact signal unavailable: ${String(err)}`);
      limitations.push(SIGNAL_LIMITATION.globalImpact);
    }
  } else {
    limitations.push(SIGNAL_LIMITATION.globalImpact);
  }

  // 학습 적합성 / 감점 — one Haiku call for the whole candidate list.
  let usage: CallUsage | undefined;
  if (typeof llm.scoreLearnabilityAndDemerit === "function") {
    const pool = [...eligible]
      .sort((a, b) => b.outletCount - a.outletCount)
      .slice(0, LEARNABILITY_POOL_SIZE);
    try {
      const result = await llm.scoreLearnabilityAndDemerit(
        pool.map((c) => ({
          id: c.id,
          title: c.title,
          category: c.category,
          summaries: c.items.slice(0, 3).map((i) => `[${i.outlet}] ${i.title}: ${i.summary}`),
        })),
      );
      usage = result.usage;
      // Matched by id, never by position: a model that returns nine scores for
      // ten inputs would otherwise shift every judgment onto the wrong story.
      for (const score of result.scores) {
        set(score.id, {
          learnability: score.learnabilityScore,
          demerit: score.demeritScore,
        });
      }
      if (result.scores.length === 0) limitations.push(SIGNAL_LIMITATION.learnability);
    } catch (err) {
      log(`[select] learnability signal unavailable: ${String(err)}`);
      limitations.push(SIGNAL_LIMITATION.learnability);
    }
  } else {
    limitations.push(SIGNAL_LIMITATION.learnability);
  }

  return { byId, usage, limitations };
}

/**
 * Layer 3 편집회의 — top10-curation.md §1 Layer 3.
 *
 * Hands the top-scored candidates to the LLM and asks for its ten with
 * reasons. What comes back is written onto the candidates as a preference
 * order and a per-story rationale; Layer 1 then fills the quota from that
 * order and overrules whatever breaks a rule.
 *
 * Before this existed, the same call was made AFTER selection and its answer
 * was used only for the rationale text — the model was asked to pick ten from
 * ten it had already been given, and its actual editorial judgment was
 * discarded.
 */
async function runEditorialMeeting(
  scored: ScoredCandidate[],
  llm: LLMProvider,
  log: (message: string) => void,
): Promise<{ rationales: Map<string, string>; usage?: CallUsage; limitations: string[] }> {
  const pool = [...scored].sort((a, b) => b.score - a.score).slice(0, LAYER3_POOL_SIZE);
  try {
    const result = await llm.selectTop10(
      pool.map((c) => ({
        id: c.cluster.id,
        title: c.cluster.title,
        category: c.cluster.category,
        outletCount: c.cluster.outletCount,
        summaries: c.cluster.items
          .slice(0, 5)
          .map((i) => `[${i.outlet}] ${i.title}: ${i.summary}`),
      })),
    );
    const byId = new Map(scored.map((c) => [c.cluster.id, c]));
    for (const selection of result.selections) {
      const candidate = byId.get(selection.id);
      // A hallucinated id names a story that was never a candidate; ignoring
      // it is the whole point of re-validating in code.
      if (!candidate) {
        log(`[select] editorial call named an unknown candidate id (${selection.id}) — ignored`);
        continue;
      }
      candidate.llmProposedRank = selection.rankInEdition;
    }
    return {
      rationales: new Map(result.selections.map((s) => [s.id, s.rationale])),
      usage: result.usage,
      limitations: [],
    };
  } catch (err) {
    // Selection must survive an LLM outage: without a proposal every
    // candidate keeps llmProposedRank=null and the Layer 2 score orders them,
    // which is exactly the pre-Layer-3 behaviour.
    log(`[select] editorial meeting unavailable, falling back to score order: ${String(err)}`);
    return { rationales: new Map(), limitations: [SIGNAL_LIMITATION.layer3] };
  }
}

export async function selectTop10(
  clusters: EventCluster[],
  llm: LLMProvider,
  options: Top10Options = {},
): Promise<Top10Result> {
  const log = options.log ?? (() => {});
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

  // Layer 2: gather the two signals that come from outside this module, then
  // score every candidate with them.
  const external = await gatherExternalSignals(eligible, llm, options);
  const scored = buildScoredCandidates(eligible, now, external.byId);

  // Layer 3: the editorial call, BEFORE selection — it writes a preference
  // order onto `scored` that Layer 1 then fills the quota from.
  const editorial = await runEditorialMeeting(scored, llm, log);
  const rationales = editorial.rationales;

  // Layer 1: the rules, applied to the AI's proposal.
  const { chosen, report: partialReport } = runLayer1Selection(scored, now);

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
    usage: editorial.usage,
    learnabilityUsage: external.usage,
    heldBack: [...heldBackTwoSource, ...notSelectedEligible],
    report: {
      editionDate,
      generatedAt: now.toISOString(),
      ...partialReport,
      // Signals that were supposed to inform this edition's scores but
      // didn't, named in the operator's own report rather than a log line
      // nobody reads.
      limitations: [...partialReport.limitations, ...external.limitations, ...editorial.limitations],
    },
  };
}
