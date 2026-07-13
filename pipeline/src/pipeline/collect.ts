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

function stripHtml(input: string | undefined): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
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
