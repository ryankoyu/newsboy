/**
 * [3] Layer 2 — 중요도 점수 (top10-curation.md §1 Layer 2).
 *
 * Composite score for one EventCluster. Three of the six signals in the
 * design's table are computable from the collected items alone:
 *   - source diversity: distinct outletKey count + distinct country count
 *   - Korea relevance: boost when a KR-country outlet co-reports
 *   - freshness: how recent the latest report is
 *
 * The other three come from outside and are passed in by the caller, because
 * they cost either a network round trip or an LLM call and are therefore
 * gathered once per run for all candidates rather than per cluster here:
 *   - 글로벌 영향력: how many countries' media carry the story
 *     (pipeline/globalImpact.ts, GDELT metadata)
 *   - 학습 적합성 / 감점: narrative clarity and sensationalism
 *     (LLMProvider.scoreLearnabilityAndDemerit, one Haiku call for the whole
 *     candidate list)
 *
 * All three are optional. An absent signal scores 0, which is neutral — it
 * shifts every candidate equally and so changes no ranking — rather than a
 * penalty, so a GDELT outage or a mock provider degrades the score's
 * sharpness without distorting it.
 *
 * The score is a ranking aid, not a hard rule: selectTop10.ts sorts
 * candidates by this score within Layer 1's quota/rule constraints, it does
 * not decide selection on its own.
 */

import type { EventCluster } from "../types.js";

export interface ScoreBreakdown {
  sourceDiversity: number;
  countryDiversity: number;
  koreaRelevance: number;
  freshness: number;
  /** 0-1, from GDELT country reach. 0 when no signal was gathered. */
  globalImpact: number;
  /** 0-1 LLM judgment of how well the story suits an English learner. */
  learnability: number;
  /** 0-1 LLM judgment of gossip/sensationalism/internal-politics minutiae — subtracted. */
  demerit: number;
  total: number;
}

/** Externally-gathered Layer 2 signals for one cluster. */
export interface ExternalSignals {
  globalImpact?: number;
  learnability?: number;
  demerit?: number;
}

const WEIGHTS = {
  sourceDiversity: 2.0,
  countryDiversity: 1.5,
  koreaRelevance: 3.0,
  freshness: 2.0,
  // Reach across national media lines is worth about as much as the number
  // of our own feeds carrying it — it measures the same thing with a much
  // wider aperture, so it neither dominates nor duplicates source diversity.
  globalImpact: 2.0,
  // The digest exists to be read in English by learners, so suitability is
  // weighted on a par with importance signals.
  learnability: 2.0,
  // Negative by construction: 감점 in the design's table.
  demerit: -2.0,
} as const;

/** Cap so one wildly-corroborated story doesn't dwarf every other signal. */
const SOURCE_DIVERSITY_CAP = 6;
const COUNTRY_DIVERSITY_CAP = 4;

const FRESHNESS_HALF_LIFE_HOURS = 18;

function freshnessScore(latestPublishedAt: string | null, now: Date): number {
  if (!latestPublishedAt) return 0.3; // unknown timestamp — mild neutral score, not a penalty or reward
  const publishedMs = new Date(latestPublishedAt).getTime();
  if (Number.isNaN(publishedMs)) return 0.3;
  const ageHours = Math.max(0, (now.getTime() - publishedMs) / (3600 * 1000));
  // Exponential decay: 1.0 at age=0, 0.5 at age=half-life.
  return Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
}

/** Clamp an externally-supplied 0-1 signal; anything out of range is ignored. */
function clamp01(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function scoreCluster(
  cluster: EventCluster,
  now: Date = new Date(),
  external: ExternalSignals = {},
): ScoreBreakdown {
  const sourceDiversity =
    Math.min(cluster.outletCount, SOURCE_DIVERSITY_CAP) / SOURCE_DIVERSITY_CAP;
  const countryDiversity =
    Math.min(cluster.countries.length, COUNTRY_DIVERSITY_CAP) / COUNTRY_DIVERSITY_CAP;
  const koreaRelevance = cluster.countries.includes("KR") ? 1 : 0;
  const freshness = freshnessScore(cluster.latestPublishedAt, now);
  const globalImpact = clamp01(external.globalImpact);
  const learnability = clamp01(external.learnability);
  const demerit = clamp01(external.demerit);

  const total =
    sourceDiversity * WEIGHTS.sourceDiversity +
    countryDiversity * WEIGHTS.countryDiversity +
    koreaRelevance * WEIGHTS.koreaRelevance +
    freshness * WEIGHTS.freshness +
    globalImpact * WEIGHTS.globalImpact +
    learnability * WEIGHTS.learnability +
    demerit * WEIGHTS.demerit;

  return {
    sourceDiversity,
    countryDiversity,
    koreaRelevance,
    freshness,
    globalImpact,
    learnability,
    demerit,
    total,
  };
}
