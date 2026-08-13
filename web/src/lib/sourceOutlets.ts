import type { Source } from "@/lib/types";

/**
 * Outlet de-duplication for the web display layer — docs/feature-status.md
 * G2 ("신뢰 고지·소스 배지 매체 수 부풀림"). The pipeline already dedupes by
 * `outletKey` when clustering (pipeline/src/pipeline/cluster.ts), but the
 * seed `Source` rows shipped to the web app carry no `outletKey` field, only
 * `outlet` (a free-text label) and `url`. Two RSS feeds from the same outlet
 * (e.g. Guardian World + Guardian US-News) show up as two Source rows with
 * the same domain but different `outlet` strings — so grouping by `outlet`
 * text alone under-counts duplicates (e.g. "Korea Herald (Sports)" vs
 * "Korea Herald (Life & Culture)" pointing at the very same URL).
 *
 * We dedupe by URL hostname (minus a leading "www.") instead. This is a
 * heuristic, not a perfect outlet identity match (e.g. a Google News
 * redirect link and the originating outlet's own domain will still count
 * as two) — documented limitation, matches the URL-domain approach
 * specified for the fix.
 */

function outletDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export interface OutletGroup {
  /** Domain used as the de-dup key. */
  domain: string;
  /** Display label — the first non-null `outlet` name seen for this domain. */
  label: string;
  /** All source rows (article links) that belong to this outlet. */
  sources: Source[];
}

/** Groups sources by outlet domain. Order follows first appearance. */
export function groupSourcesByOutlet(sources: Source[]): OutletGroup[] {
  const groups = new Map<string, OutletGroup>();
  for (const s of sources) {
    const domain = outletDomain(s.url);
    const existing = groups.get(domain);
    if (existing) {
      existing.sources.push(s);
    } else {
      groups.set(domain, {
        domain,
        label: s.outlet ?? domain,
        sources: [s],
      });
    }
  }
  return [...groups.values()];
}

/** Number of distinct outlets (by domain) among the given sources. */
export function countUniqueOutlets(sources: Source[]): number {
  return groupSourcesByOutlet(sources).length;
}

/**
 * Domains that carry someone else's reporting rather than doing their own.
 *
 * A Google News link is a pointer, not a newsroom. Counting one as an
 * independent outlet is how the 2026-08-12 edition published two articles
 * that looked doubly sourced — Nikkei plus Google News, Yonhap plus Google
 * News — when each rested on a single outlet's reporting.
 */
const AGGREGATOR_DOMAINS = new Set(["news.google.com", "google.com"]);

/**
 * Distinct outlets that actually reported the story, aggregators excluded.
 *
 * Use this — not countUniqueOutlets — for anything that makes a claim to the
 * reader about cross-verification. countUniqueOutlets answers "how many
 * places did we fetch from", which is a different and less interesting
 * question.
 */
export function countIndependentOutlets(sources: Source[]): number {
  return groupSourcesByOutlet(sources).filter((g) => !AGGREGATOR_DOMAINS.has(g.domain)).length;
}
