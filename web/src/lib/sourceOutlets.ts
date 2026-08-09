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
