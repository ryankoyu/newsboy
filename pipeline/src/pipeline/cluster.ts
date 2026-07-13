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
/** At/above this, treated as same event without an LLM call. */
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
    let boundaryClusterIdx = -1;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      // Only compare against same-category clusters — cross-category same
      // event is rare and category drives Top10 balance downstream anyway.
      if (cluster.items[0].category !== item.category) continue;
      if (!cluster.items.some((existing) => withinTimeWindow(existing, item))) continue;

      // Compare against the cluster's representative (first) item tokens —
      // cheap proxy for "does this belong here."
      let maxScore = 0;
      for (const tokenSet of cluster.tokenSets) {
        const score = jaccard(itemTokens, tokenSet);
        if (score > maxScore) maxScore = score;
      }

      if (maxScore >= HIGH_SIMILARITY_CEILING && maxScore > bestScore) {
        bestScore = maxScore;
        bestClusterIdx = i;
      } else if (maxScore >= LOW_SIMILARITY_FLOOR && boundaryClusterIdx === -1) {
        boundaryClusterIdx = i;
      }
    }

    if (bestClusterIdx >= 0) {
      clusters[bestClusterIdx].items.push(item);
      clusters[bestClusterIdx].tokenSets.push(itemTokens);
      continue;
    }

    if (boundaryClusterIdx >= 0 && options.llm) {
      const candidate = clusters[boundaryClusterIdx];
      const isSameEvent = await options.llm.judgeSameEvent({
        a: { title: candidate.items[0].title, summary: candidate.items[0].summary },
        b: { title: item.title, summary: item.summary },
      });
      if (isSameEvent) {
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
