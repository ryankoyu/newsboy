/**
 * [3] Layer 2 — 중요도 점수 (top10-curation.md §1 Layer 2).
 *
 * Composite score for one EventCluster, built ONLY from signals computable
 * without an LLM call (task constraint: "코드로 가능한 신호만"):
 *   - source diversity: distinct outletKey count + distinct country count
 *   - Korea relevance: boost when a KR-country outlet co-reports
 *   - freshness: how recent the latest report is
 *
 * LLM-only signals (learnability, demerit) are a stub on LLMProvider
 * (see llm/provider.ts LearnabilityAndDemeritInput) and are NOT included in
 * this score yet — TODO once an API key is wired.
 *
 * The score is a ranking aid, not a hard rule: selectTop10Rules.ts sorts
 * candidates by this score within Layer 1's quota/rule constraints, it does
 * not decide selection on its own.
 */

import type { EventCluster } from "../types.js";

export interface ScoreBreakdown {
  sourceDiversity: number;
  countryDiversity: number;
  koreaRelevance: number;
  freshness: number;
  total: number;
}

const WEIGHTS = {
  sourceDiversity: 2.0,
  countryDiversity: 1.5,
  koreaRelevance: 3.0,
  freshness: 2.0,
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

export function scoreCluster(cluster: EventCluster, now: Date = new Date()): ScoreBreakdown {
  const sourceDiversity =
    Math.min(cluster.outletCount, SOURCE_DIVERSITY_CAP) / SOURCE_DIVERSITY_CAP;
  const countryDiversity =
    Math.min(cluster.countries.length, COUNTRY_DIVERSITY_CAP) / COUNTRY_DIVERSITY_CAP;
  const koreaRelevance = cluster.countries.includes("KR") ? 1 : 0;
  const freshness = freshnessScore(cluster.latestPublishedAt, now);

  const total =
    sourceDiversity * WEIGHTS.sourceDiversity +
    countryDiversity * WEIGHTS.countryDiversity +
    koreaRelevance * WEIGHTS.koreaRelevance +
    freshness * WEIGHTS.freshness;

  return { sourceDiversity, countryDiversity, koreaRelevance, freshness, total };
}
