/**
 * [1] RSS 수집 — a1-architecture.md §2 [1], news-sourcing-strategy.md §1.
 *
 * Fetches each whitelisted RSS/Atom feed, with per-source retry + exponential
 * backoff and a hard timeout. A single dead source never aborts the run —
 * failures are recorded in `sourceReport` and the pipeline proceeds with
 * whatever succeeded (A1 §2 failure table: "특정 소스가 죽어도 파이프라인 전체는 진행").
 *
 * Only the RSS feed's own title/summary fields are read — no full-article
 * scraping (news-sourcing-strategy.md §1 collection principle #2).
 */

import Parser from "rss-parser";
import type { CategorySlug, CollectResult, RawItem, SourceConfig } from "../types.js";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 500;

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    // Some feeds (Guardian, Yonhap) block generic bot UAs at the CDN edge; a
    // standard browser UA is what R1's server-side curl verification used.
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTML entities that turn up in RSS titles and summaries.
 *
 * The previous version decoded a hand-picked four (nbsp, amp, #39, quot) and
 * left everything else as literal text, so "McGregor&apos;s UFC comeback"
 * reached the review console — and the public deck — with the entity visible.
 * &apos; is the one XML-flavoured feeds reach for most.
 *
 * Only the entities that actually occur in news copy are listed; anything
 * unlisted is left alone rather than guessed at.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
  nbsp: " ",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  sbquo: "\u201a",
  bdquo: "\u201e",
  mdash: "\u2014",
  ndash: "\u2013",
  minus: "\u2212",
  hellip: "\u2026",
  middot: "\u00b7",
  bull: "\u2022",
  laquo: "\u00ab",
  raquo: "\u00bb",
  deg: "\u00b0",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  cent: "\u00a2",
  trade: "\u2122",
  copy: "\u00a9",
  reg: "\u00ae",
  times: "\u00d7",
  frac12: "\u00bd",
  prime: "\u2032",
  Prime: "\u2033",
  eacute: "\u00e9",
  egrave: "\u00e8",
  agrave: "\u00e0",
  ccedil: "\u00e7",
  ntilde: "\u00f1",
  uuml: "\u00fc",
  ouml: "\u00f6",
  auml: "\u00e4",
  szlig: "\u00df",
  aacute: "\u00e1",
  iacute: "\u00ed",
  oacute: "\u00f3",
  uacute: "\u00fa",
};

/**
 * Decode named and numeric entities in ONE pass.
 *
 * The pass matters: decoding &amp; separately and first turns the literal
 * text "&amp;#39;" into an apostrophe, when what the publisher wrote was the
 * characters "&#39;". Handling every entity in a single sweep leaves each one
 * decoded exactly once.
 */
function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code, whole) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code, whole) : whole;
    }
    // Named lookup is case-sensitive on purpose: &Prime; and &prime; differ.
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function safeFromCodePoint(code: number, fallback: string): string {
  if (code <= 0 || code > 0x10ffff) return fallback;
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

export function stripHtml(input: string | undefined): string {
  if (!input) return "";
  return decodeEntities(input.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchFeedWithRetry(
  source: SourceConfig,
): Promise<{ items: RawItem[]; error?: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const feed = await parser.parseURL(source.url);
      const items: RawItem[] = (feed.items ?? []).map((item, idx) => ({
        outlet: source.outlet,
        url: item.link ?? source.url,
        title: stripHtml(item.title) || "(untitled)",
        summary: stripHtml(item.contentSnippet ?? item.content ?? item.summary),
        publishedAt: item.isoDate ?? item.pubDate ?? null,
        category: source.category as CategorySlug,
        guid: item.guid ?? item.id ?? `${source.outlet}-${idx}-${item.link ?? ""}`,
        outletKey: source.outletKey,
        country: source.country,
      }));
      return { items };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  return { items: [], error: message };
}

export async function collect(sources: SourceConfig[]): Promise<CollectResult> {
  const items: RawItem[] = [];
  const sourceReport: CollectResult["sourceReport"] = [];

  // Sequential, deliberately: avoids hammering feeds concurrently and keeps
  // backoff behavior predictable for a daily batch job (no latency pressure).
  for (const source of sources) {
    const { items: fetched, error } = await fetchFeedWithRetry(source);
    sourceReport.push({
      outlet: source.outlet,
      url: source.url,
      ok: !error,
      itemCount: fetched.length,
      error,
    });
    items.push(...fetched);
  }

  return { items, sourceReport };
}
