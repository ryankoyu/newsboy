/**
 * [2] 사건 클러스터링 — a1-architecture.md §2 [2].
 *
 * Groups RawItems that describe the same real-world event across multiple
 * outlets. Design per A1: "헤드라인·본문 임베딩 유사도 + 발행 시간창으로 1차
 * 그룹핑 → 경계 사례는 LLM로 판정."
 *
 * [추측] No embedding API is wired up yet (no key assumed available for this
 * stage either — see LLMProvider). Stage 1 here uses a lexical-overlap
 * heuristic (shared significant tokens between titles + summaries) within a
 * publish-time window as a stand-in for embedding similarity. Boundary cases
 * are then handed to the LLMProvider for a same-event yes/no judgment, per
 * the design. This keeps the two-stage shape A1 specifies even though stage 1
 * is heuristic rather than a real embedding model — swap in an embeddings
 * call later without changing the cluster() signature.
 *
 * outletCount here is a DEDUPED SOURCE count (by outletKey), not a raw item
 * count — top10-curation.md §1 Layer 1 "소스 중복 판정 강화" (rank8 fix: two
 * feeds from the same outlet must not look like 2 independent sources).
 */

import { randomUUID } from "node:crypto";
import type { EventCluster, RawItem } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { CallUsage } from "../llm/cost.js";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "it", "its", "this", "that", "after", "over", "into", "than", "amid",
  "says", "said", "new", "how", "what", "why", "will", "has", "have", "had",
]);

function significantTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const TIME_WINDOW_HOURS = 48;
/** Below this, never considered the same event even as a boundary case. */
const LOW_SIMILARITY_FLOOR = 0.12;
/**
 * At/above this, treated as same event without an LLM call.
 *
 * Measured on a real collect (2026-08-11, 1,732 items inside the 48h window,
 * 1,413,721 pairs): 1,407,276 pairs score below the floor, 5,992 land in the
 * 0.12–0.32 band, 453 sit at/above the ceiling. So nearly every merge decision
 * that isn't obvious is bought from Haiku — which is where the cluster stage's
 * money goes.
 *
 * The band is NOT junk, though: reading a random sample of cross-outlet band
 * pairs turned up real same-event pairs ("DRC Ebola death toll passes 2,000"
 * ↔ "Congo says 2,000 people have died…", 0.29; "Ukraine says Russia fired
 * North Korean missiles" ↔ "Russia used North Korean missiles…", 0.24)
 * sitting next to unrelated ones at the same score ("Volatility tumbles as
 * markets shrug off Middle East risks" ↔ "Singapore, Thailand attract luxury
 * yachts as Middle East risks rise", 0.19). Lowering the ceiling would merge
 * both kinds. Deciding this properly needs a labelled sample — same-event
 * yes/no on a few hundred band pairs — which nobody has produced yet, so the
 * value stays where it is rather than moving on a hunch.
 */
const HIGH_SIMILARITY_CEILING = 0.32;

function withinTimeWindow(a: RawItem, b: RawItem): boolean {
  if (!a.publishedAt || !b.publishedAt) return true; // don't over-reject on missing dates
  const ta = new Date(a.publishedAt).getTime();
  const tb = new Date(b.publishedAt).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true;
  return Math.abs(ta - tb) <= TIME_WINDOW_HOURS * 3600 * 1000;
}

interface ClusterOptions {
  /** Optional — used only for boundary-case (same-event?) judgment calls. */
  llm?: LLMProvider;
  /**
   * Called once per boundary judgment that actually hit the API, so the
   * caller can price the cluster stage. Optional: clustering behaves
   * identically without it.
   */
  onUsage?: (usage: CallUsage) => void;
}

export async function clusterEvents(
  items: RawItem[],
  options: ClusterOptions = {},
): Promise<EventCluster[]> {
  const clusters: Array<{ items: RawItem[]; tokenSets: Set<string>[] }> = [];

  for (const item of items) {
    const itemTokens = significantTokens(`${item.title} ${item.summary}`);

    let bestClusterIdx = -1;
    let bestScore = 0;
    // Boundary candidate = the BEST match in the band, not the first one
    // encountered. Keeping the first meant the Haiku call asked about
    // whichever qualifying cluster happened to be created earliest: money
    // spent on a weaker candidate, and a "no" that left the better match
    // unexamined (the item then started its own cluster next to the cluster
    // it belonged in). boundaryItemIdx is the member that actually scored
    // highest, so the question we pay for is about the closest headline in
    // that cluster rather than its first-arrived one.
    let boundaryClusterIdx = -1;
    let boundaryScore = 0;
    let boundaryItemIdx = 0;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      // Only compare against same-category clusters. Category comes from the
      // feed, not the story, so one event really can land in two categories —
      // measured on the 2026-08-11 collect, allowing cross-category merges
      // formed 29 mixed clusters and lifted two-source clusters from 14 to 21.
      // Left off anyway: 22 of those 29 were the same Google News item under
      // two topic queries (one outletKey, no help to the 2-source gate), one
      // was a false merge on shared "- ABC News & Headlines" title boilerplate,
      // and a merged cluster's category — which drives Top10 balance — would
      // be decided by feed arrival order. Turning it on is a yield/balance
      // policy call, not a clustering detail.
      if (cluster.items[0].category !== item.category) continue;
      if (!cluster.items.some((existing) => withinTimeWindow(existing, item))) continue;

      // Score against every member, not just the first: a cluster's later
      // items often carry the wording a newcomer matches.
      let maxScore = 0;
      let maxScoreItemIdx = 0;
      for (let j = 0; j < cluster.tokenSets.length; j++) {
        const score = jaccard(itemTokens, cluster.tokenSets[j]);
        if (score > maxScore) {
          maxScore = score;
          maxScoreItemIdx = j;
        }
      }

      if (maxScore >= HIGH_SIMILARITY_CEILING && maxScore > bestScore) {
        bestScore = maxScore;
        bestClusterIdx = i;
      } else if (maxScore >= LOW_SIMILARITY_FLOOR && maxScore > boundaryScore) {
        boundaryScore = maxScore;
        boundaryClusterIdx = i;
        boundaryItemIdx = maxScoreItemIdx;
      }
    }

    if (bestClusterIdx >= 0) {
      clusters[bestClusterIdx].items.push(item);
      clusters[bestClusterIdx].tokenSets.push(itemTokens);
      continue;
    }

    if (boundaryClusterIdx >= 0 && options.llm) {
      const candidate = clusters[boundaryClusterIdx];
      const reference = candidate.items[boundaryItemIdx];
      const { sameEvent, usage } = await options.llm.judgeSameEvent({
        a: { title: reference.title, summary: reference.summary },
        b: { title: item.title, summary: item.summary },
      });
      // One Haiku call per boundary-case item — the most frequent LLM call in
      // the pipeline, and previously invisible in the cost summary because
      // this method returned a bare boolean.
      if (usage) options.onUsage?.(usage);
      if (sameEvent) {
        candidate.items.push(item);
        candidate.tokenSets.push(itemTokens);
        continue;
      }
    }

    clusters.push({ items: [item], tokenSets: [itemTokens] });
  }

  return clusters.map((cluster) => {
    // Representative title = item with the longest summary (fullest signal).
    const representative = cluster.items.reduce((best, cur) =>
      cur.summary.length > best.summary.length ? cur : best,
    );
    // Source-dedup by outletKey, NOT by raw `outlet` name (top10-curation.md
    // §1 Layer 1 "소스 중복 판정 강화" — rank8 fix). Two Google News topic
    // queries or two Korea Herald category feeds share an outletKey and must
    // count as ONE source for the 2-source gate. Falls back to `outlet` name
    // only for fixtures/tests that don't set outletKey.
    const outletKeys = new Set(cluster.items.map((i) => i.outletKey ?? i.outlet));
    const outletCount = outletKeys.size;
    const countries = new Set(
      cluster.items.map((i) => i.country).filter((c): c is string => Boolean(c)),
    );
    const publishedDates = cluster.items
      .map((i) => i.publishedAt)
      .filter((d): d is string => Boolean(d))
      .sort();
    const earliestPublishedAt = publishedDates[0] ?? null;
    const latestPublishedAt = publishedDates[publishedDates.length - 1] ?? null;

    return {
      id: randomUUID(),
      title: representative.title,
      category: cluster.items[0].category,
      items: cluster.items,
      outletCount,
      outletKeys: [...outletKeys],
      countries: [...countries],
      earliestPublishedAt,
      latestPublishedAt,
    } satisfies EventCluster;
  });
}
