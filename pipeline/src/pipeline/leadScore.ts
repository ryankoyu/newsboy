/**
 * Which of the day's ten runs on the front page.
 *
 * WHY THIS IS SEPARATE FROM score.ts
 *
 * score.ts answers "does this belong in today's ten" and feeds the category
 * quota in selectTop10. It was never designed to answer "which one leads",
 * and using it for that produced a demonstrably wrong front page. From the
 * 2026-07-13 selection report:
 *
 *   rank 1  7.066  outlets 0.50  countries 0.75  KR 1  fresh 0.9707
 *   rank 4  6.973  outlets 0.50  countries 0.75  KR 1  fresh 0.9241
 *   rank 5  5.464  outlets 1.00  countries 1.00  KR 0  fresh 0.9820
 *
 * Two failures are visible there. Korea relevance carries the single largest
 * weight (3.0) and is binary, so any Korea-co-reported story outranks any
 * story without one no matter how widely the world covered it — "Princess
 * Anne to attend an event" led a senator's death. And once a story clears the
 * diversity caps, the remaining separation is freshness alone: ranks 1-4 are
 * the same story profile ordered by publication minute. The lead was
 * effectively "the most recent Korea-tagged item".
 *
 * WHAT THIS SCORES INSTEAD
 *
 * Reach, consequence, and audience relevance — with freshness demoted to a
 * tiebreaker rather than the deciding signal:
 *
 *   reach        how many distinct outlets and countries carried it, log-scaled
 *                and UNCAPPED, so 15 outlets still beats 6 (score.ts caps at 6
 *                and 4, which is why the top candidates were tied)
 *   consequence  whether the story carries human or material stakes
 *   korea        relevance to the reader, applied as a multiplier so it
 *                amplifies an already-important story instead of lifting a
 *                thin one over a major event
 *   freshness    a small term that only separates otherwise-equal stories
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not change which ten stories are selected — the quota system in
 * selectTop10 decides that and is left alone. This only orders the ten that
 * were already chosen.
 *
 * LIMITATIONS (real, and worth knowing before trusting a ranking)
 *
 * Consequence starts from a keyword flag (rules.ts CASUALTY_KEYWORDS) and is
 * graded by any casualty figure STATED in the source text. Spelled-out numbers
 * ("two dead") are not read, and a story that reports no toll keeps only the
 * base weight — both understate rather than invent. Non-human magnitude
 * (money, people displaced) is not read at all yet.
 *
 * Country attribution comes from the reporting outlet's edition, not the
 * story's subject (rules.ts documents the same caveat), so "3 countries"
 * means three countries carried it, not that three are involved.
 */

import type { EventCluster } from "../types.js";
import { isCasualtyStory, isPoliticalStory } from "./rules.js";

export interface LeadScoreBreakdown {
  reach: number;
  consequence: number;
  /** Largest casualty figure stated in the source text; 0 when none is. */
  casualtyCount: number;
  korea: number;
  freshness: number;
  total: number;
  /** Set when the story is barred from the front page; total is forced to 0. */
  disqualifiedBecause?: string;
}

const WEIGHTS = {
  reach: 4.0,
  consequence: 2.5,
  // Deliberately an order of magnitude below the rest: it breaks ties, it
  // does not decide the front page.
  freshness: 0.4,
} as const;

/**
 * Korea relevance AMPLIFIES importance rather than creating it.
 *
 * As a flat bonus it was the largest single term, so a 3-outlet Korean item
 * with no stated stakes outranked a fire that killed 27 across 7 outlets in
 * 6 countries — the bonus alone was worth more than the entire gap in reach
 * and consequence. A multiplier cannot do that: it lifts a story that already
 * scores, and leaves a thin one thin.
 */
const KOREA_MULTIPLIER = 1.25;

/**
 * Outlet counts where the log curve is normalised. A story on ~20 outlets is
 * treated as saturated reach; below that the curve keeps discriminating,
 * which is the property score.ts's hard cap of 6 lost.
 */
const REACH_SATURATION_OUTLETS = 20;
const REACH_SATURATION_COUNTRIES = 8;

const FRESHNESS_HALF_LIFE_HOURS = 18;

/** Casualty count at which magnitude is treated as saturated. */
const CASUALTY_SATURATION = 100;
/** Score a casualty story earns before any toll is read from the text. */
const CASUALTY_BASE = 0.35;

/**
 * Numbers written next to a casualty word, e.g. "27 die", "kills 27",
 * "at least 27 dead", "27 people were killed".
 *
 * Both orders are matched, with a few words of slack between the number and
 * the term so "27 people were killed" counts. Only digits are read — spelled
 * numbers ("two dead") are missed, which understates rather than invents.
 */
const CASUALTY_COUNT_PATTERNS: RegExp[] = [
  /(\d[\d,]*)(?:\s+\w+){0,3}\s+(?:die|dies|died|dead|killed|injured|wounded|missing)\b/g,
  /\b(?:kill|kills|killed|injure|injures|injured|leaves?)\s+(?:at least\s+)?(\d[\d,]*)\b/g,
  /\b(?:death toll|toll)\s+(?:of|rises? to|climbs? to|at)\s+(\d[\d,]*)\b/g,
];

/**
 * Largest casualty figure stated in the cluster's own text, or 0 when none
 * is stated. Nothing is inferred: an unstated toll stays 0 and the story
 * still scores the base consequence weight for being a casualty story.
 */
export function statedCasualtyCount(cluster: EventCluster): number {
  const text = [cluster.title, ...cluster.items.slice(0, 5).map((i) => i.summary)]
    .join(" ")
    .toLowerCase();
  let max = 0;
  for (const re of CASUALTY_COUNT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const raw = m[1];
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n) || n <= max) continue;
      // "the 1923 earthquake that killed many" reads as a toll of 1923 unless
      // years are excluded. A real four-digit toll is nearly always written
      // with a separator ("2,000 dead"), so an unseparated number in year
      // range is treated as a date. This can miss a genuine toll written as
      // "1900 killed" — understating, never inventing.
      const looksLikeYear = !raw.includes(",") && n >= 1800 && n <= 2100;
      if (looksLikeYear) continue;
      if (n < 100_000) max = n;
    }
  }
  return max;
}

/** log1p-normalised 0..1 — no hard ceiling, so the tail still separates. */
function logNormalised(value: number, saturation: number): number {
  if (value <= 0) return 0;
  return Math.min(1, Math.log1p(value) / Math.log1p(saturation));
}

function freshness(latestPublishedAt: string | null, now: Date): number {
  if (!latestPublishedAt) return 0.3;
  const ms = new Date(latestPublishedAt).getTime();
  if (Number.isNaN(ms)) return 0.3;
  const ageHours = Math.max(0, (now.getTime() - ms) / 3_600_000);
  return Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
}

/**
 * Front-page disqualifiers, applied before scoring.
 *
 * These are about what a lead story IS, not about quality of the writing —
 * gate results do not exist yet when selection runs, so "failed its quality
 * gate" is enforced separately by the caller once gating has happened.
 */
function disqualify(cluster: EventCluster): string | undefined {
  // A single outlet is not a front page, whatever the story. This mirrors the
  // two-source rule the whole product is built on.
  if (cluster.outletCount < 2) return "single outlet";

  // One country's internal legislative business is not the lead for a Korean
  // general-reader brief, even when the wires carry a lot of it. This is the
  // demerit top10-curation.md §1 Layer 2 asks for and never got.
  if (isPoliticalStory(cluster) && cluster.countries.length < 2) {
    return "single-country internal politics";
  }

  return undefined;
}

export function computeLeadScore(
  cluster: EventCluster,
  now: Date = new Date(),
): LeadScoreBreakdown {
  const disqualifiedBecause = disqualify(cluster);

  const reach =
    (logNormalised(cluster.outletCount, REACH_SATURATION_OUTLETS) +
      logNormalised(cluster.countries.length, REACH_SATURATION_COUNTRIES)) /
    2;
  // Graded, not binary. A binary flag scored one sailor's death and a fire
  // that killed 27 identically, which left Korea relevance deciding between
  // them. Stories with no stated toll keep the base weight.
  const casualtyCount = statedCasualtyCount(cluster);
  const consequence = isCasualtyStory(cluster)
    ? CASUALTY_BASE + (1 - CASUALTY_BASE) * logNormalised(casualtyCount, CASUALTY_SATURATION)
    : 0;
  const korea = cluster.countries.includes("KR") ? 1 : 0;
  const fresh = freshness(cluster.latestPublishedAt, now);

  const base =
    reach * WEIGHTS.reach + consequence * WEIGHTS.consequence + fresh * WEIGHTS.freshness;
  const total = disqualifiedBecause ? 0 : base * (korea ? KOREA_MULTIPLIER : 1);

  return { reach, consequence, casualtyCount, korea, freshness: fresh, total, disqualifiedBecause };
}

/**
 * Order already-selected events for the front page, highest lead score first.
 * Ties (including every disqualified story, which all score 0) fall back to
 * the selection score so the ordering stays deterministic.
 */
export function orderForFrontPage<T extends { cluster: EventCluster; score: number }>(
  chosen: T[],
  now: Date = new Date(),
): Array<T & { leadScore: LeadScoreBreakdown }> {
  return chosen
    .map((c) => ({ ...c, leadScore: computeLeadScore(c.cluster, now) }))
    .sort((a, b) => b.leadScore.total - a.leadScore.total || b.score - a.score);
}
