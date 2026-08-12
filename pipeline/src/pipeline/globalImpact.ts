/**
 * Layer 2 "글로벌 영향력" 신호 — top10-curation.md §1 Layer 2
 * ("세계적 파급 | GDELT 이벤트 지표 활용 가능 (무료, 이미 소스 후보)").
 *
 * GDELT indexes worldwide news coverage and, for a query, will say which
 * countries' media are carrying it. That is the signal this stage wants: an
 * event covered by outlets in fifteen countries has a different reach from
 * one covered in two, and our own whitelist of ~20 feeds cannot see the
 * difference — every story in it looks like "2-4 outlets".
 *
 * WHAT THIS IS NOT: a collection source. a1-architecture.md §2 [1] lists
 * GDELT alongside the RSS whitelist, but ingesting GDELT's article set would
 * pull text from arbitrary domains whose terms nobody has checked, which the
 * sourcing strategy (§1: 화이트리스트 + 약관 확인, RSS/공개만) forbids. Only
 * the metadata — how many articles, from how many countries — is used, and no
 * GDELT text ever reaches an article.
 *
 * COST AND RATE LIMIT: free, no key. GDELT asks for no more than one request
 * every 5 seconds and returns 429 otherwise (observed 2026-08-11: the very
 * first request in a burst comes back 429 with a plain-text notice, not
 * JSON). So requests are serial with a delay, and the number of them is
 * capped — a signal that is nice to have must not hold a daily run hostage.
 * Every failure mode degrades to "no signal for this cluster", which scores
 * as neutral rather than as a penalty.
 */

import type { EventCluster } from "../types.js";

export interface GlobalImpactSignal {
  /** GDELT articles matching this event within the lookback window. */
  articleCount: number;
  /** Distinct source countries among them — the actual reach signal. */
  countryCount: number;
}

export type GlobalImpactProvider = (
  clusters: EventCluster[],
) => Promise<Map<string, GlobalImpactSignal>>;

const GDELT_DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

/** GDELT's published limit is one request per 5 seconds. */
const DEFAULT_MIN_INTERVAL_MS = 5_500;
/** Ceiling on requests per run: 30 * 5.5s ≈ 3 minutes added to a nightly job. */
const DEFAULT_MAX_QUERIES = 30;
const DEFAULT_TIMESPAN = "48h";
const REQUEST_TIMEOUT_MS = 20_000;

interface GdeltArticle {
  title?: string;
  domain?: string;
  sourcecountry?: string;
}

export interface GdeltProviderOptions {
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests so they don't wait out the rate limit. */
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  maxQueries?: number;
  /** GDELT `timespan` — how far back to look for coverage. */
  timespan?: string;
  log?: (message: string) => void;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been", "it",
  "its", "this", "that", "after", "over", "into", "than", "amid", "says",
  "said", "new", "how", "what", "why", "will", "has", "have", "had", "more",
  "about", "could", "would", "may", "can", "his", "her", "their", "they",
]);

/**
 * Turn a headline into a GDELT query.
 *
 * Space-separated terms are ANDed by GDELT, so this keeps only the few most
 * distinctive words: too many terms and a real event returns zero articles,
 * too few and "korea" matches the whole day's news. Longest-first is a crude
 * proxy for distinctiveness, but it is the same proxy cluster.ts already uses
 * for similarity and it keeps the two stages consistent.
 */
export function buildGdeltQuery(title: string, maxTerms = 4): string {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOPWORDS.has(t));
  const unique = [...new Set(tokens)];
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, maxTerms).join(" ");
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build the real GDELT-backed provider. Not called by runPipeline unless the
 * caller passes it in (index.ts does): tests and demo runs must never depend
 * on a third-party endpoint being up.
 */
export function createGdeltGlobalImpactProvider(
  options: GdeltProviderOptions = {},
): GlobalImpactProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxQueries = options.maxQueries ?? DEFAULT_MAX_QUERIES;
  const timespan = options.timespan ?? DEFAULT_TIMESPAN;
  const log = options.log ?? (() => {});

  return async function fetchGlobalImpact(clusters) {
    const signals = new Map<string, GlobalImpactSignal>();
    // Highest-reach candidates first, so the query budget is spent on the
    // clusters most likely to be selected rather than on arrival order.
    const ordered = [...clusters].sort((a, b) => b.outletCount - a.outletCount);
    const budget = ordered.slice(0, maxQueries);
    if (ordered.length > budget.length) {
      log(
        `[global-impact] ${ordered.length} candidates, querying the top ${budget.length} (rate limit)`,
      );
    }

    let failures = 0;
    for (let i = 0; i < budget.length; i++) {
      const cluster = budget[i];
      const query = buildGdeltQuery(cluster.title);
      if (!query) continue;
      if (i > 0) await sleep(minIntervalMs);

      try {
        const url =
          `${GDELT_DOC_ENDPOINT}?query=${encodeURIComponent(`${query} sourcelang:english`)}` +
          `&mode=artlist&maxrecords=250&format=json&timespan=${encodeURIComponent(timespan)}`;
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          failures++;
          log(`[global-impact] ${cluster.id} — HTTP ${response.status}, no signal`);
          continue;
        }
        // GDELT answers rate-limit and error cases with plain text and a 200,
        // so a JSON parse failure here is expected traffic, not a bug.
        const body = await response.text();
        let parsed: { articles?: GdeltArticle[] };
        try {
          parsed = JSON.parse(body) as { articles?: GdeltArticle[] };
        } catch {
          failures++;
          log(`[global-impact] ${cluster.id} — non-JSON response (rate limit?), no signal`);
          continue;
        }
        const articles = parsed.articles ?? [];
        const countries = new Set(
          articles.map((a) => a.sourcecountry).filter((c): c is string => Boolean(c)),
        );
        signals.set(cluster.id, {
          articleCount: articles.length,
          countryCount: countries.size,
        });
      } catch (err) {
        failures++;
        log(`[global-impact] ${cluster.id} — request failed (${String(err)}), no signal`);
      }
    }

    if (failures > 0) {
      log(
        `[global-impact] ${signals.size}/${budget.length} clusters scored; ${failures} request(s) failed`,
      );
    }
    return signals;
  };
}

/**
 * Normalise a raw GDELT signal to 0-1 for scoring.
 *
 * Country count, not article count: article volume tracks how loudly a story
 * is being repeated, which a single wire service can inflate on its own,
 * while the number of countries carrying it is closer to what "글로벌 영향력"
 * means. The cap keeps one globally-syndicated story from swamping every
 * other signal, the same reason score.ts caps source diversity.
 */
export const GLOBAL_IMPACT_COUNTRY_CAP = 12;

export function normalizeGlobalImpact(signal: GlobalImpactSignal | undefined): number {
  if (!signal) return 0;
  return Math.min(signal.countryCount, GLOBAL_IMPACT_COUNTRY_CAP) / GLOBAL_IMPACT_COUNTRY_CAP;
}
