/**
 * One-off gate-check script for the 2026-07-13 edition (10 articles authored
 * by the writer team as pipeline/output/articles/event-1..10.json).
 *
 * Reuses the existing gate checkers as-is (no logic changes):
 *  - wordMatch: pipeline/src/gates/wordMatch.ts — every curated word must
 *    appear in its own version's body (allowing conservative inflections).
 *  - cefr: pipeline/src/gates/cefr.ts — heuristic word-count / sentence-length
 *    / vocabulary-band check per level. Ambiguous cases would defer to an
 *    LLM (checkCefr), but this script calls checkCefrHeuristic directly and
 *    records ambiguity instead of making a real LLM call — no rewrite loop
 *    exists here, this is a read-only quality report.
 *  - ngram: pipeline/src/gates/ngram.ts — n-gram overlap of the leveled body
 *    against source RSS titles/summaries. LIMITATION: only rssSummary +
 *    title text is available (no fetched full article text for most
 *    sources), so this is a partial duplication check, not a full one.
 *
 * Per task instructions:
 *  - wordMatch failures: report unmatched words, do NOT invent replacements.
 *    If a version would drop below 5 words, flag it explicitly.
 *  - CEFR: record score/pass/ambiguous only. Never touch article body text.
 *  - ngram: compare against real-top10-2026-07-13.json's rssSummary + source
 *    titles for the same rank/event (best-effort id match by rank).
 *
 * Output: pipeline/output/gate-report-2026-07-13.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkWordMatch } from "../gates/wordMatch.js";
import { checkCefrHeuristic } from "../gates/cefr.js";
import { checkNgramOverlap } from "../gates/ngram.js";
import type { CefrLevel, RawItem, WordEntry } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARTICLES_DIR = join(__dirname, "../../output/articles");
const REAL_TOP10_PATH = join(__dirname, "../../output/real-top10-2026-07-13.json");
const OUTPUT_PATH = join(__dirname, "../../output/gate-report-2026-07-13.json");

interface EventWordEntry {
  word: string;
  meaning_ko: string;
  example: string;
  ipa: string;
}

interface EventVersion {
  title: string;
  sentences: string[];
  words: EventWordEntry[];
}

interface EventFile {
  rank: number;
  category: string;
  eventSummary: string;
  facts: Array<{ text: string; sourceUrls: string[]; usedInText: boolean }>;
  sources: Array<{ outlet: string; title: string; url: string; fetched: boolean }>;
  versions: Record<"A2" | "B1" | "B2", EventVersion>;
  notes?: string;
}

interface RealTop10Source {
  outlet: string;
  title: string;
  url: string;
  rssSummary: string;
  publishedAt: string | null;
}

interface RealTop10Event {
  rank: number;
  eventSummary: string;
  category: string;
  outletCount: number;
  sources: RealTop10Source[];
}

interface RealTop10File {
  editionDate: string;
  events: RealTop10Event[];
}

function toRawItems(sources: RealTop10Source[]): RawItem[] {
  return sources.map((s) => ({
    outlet: s.outlet,
    url: s.url,
    title: s.title,
    summary: s.rssSummary,
    publishedAt: s.publishedAt,
    category: "world", // not used by ngram check; placeholder to satisfy the type
    guid: s.url,
  }));
}

function toWordEntries(words: EventWordEntry[]): WordEntry[] {
  return words.map((w, idx) => ({
    term: w.word,
    meaningKo: w.meaning_ko,
    example: w.example,
    pronunciation: w.ipa,
    sortOrder: idx + 1,
  }));
}

const LEVELS: CefrLevel[] = ["A2", "B1", "B2"];

async function main(): Promise<void> {
  const realTop10 = JSON.parse(readFileSync(REAL_TOP10_PATH, "utf-8")) as RealTop10File;
  const realTop10ByRank = new Map(realTop10.events.map((e) => [e.rank, e]));

  const articleResults: Array<Record<string, unknown>> = [];

  let totalVersionsChecked = 0;
  let wordMatchPassCount = 0;
  let cefrPassCount = 0;
  let ngramPassCount = 0;
  const singleSourceFlags: Array<{ rank: number; eventSummary: string }> = [];

  for (let rank = 1; rank <= 10; rank++) {
    const path = join(ARTICLES_DIR, `event-${rank}.json`);
    const event = JSON.parse(readFileSync(path, "utf-8")) as EventFile;

    // Single-source flag — mirrors selectTop10's MIN_OUTLETS_FOR_CANDIDACY=2
    // rule (news-sourcing-strategy.md §4-4). Dedupe by URL, not just outlet
    // label: event-8 (Matin Kim) lists the *same* Korea Herald article twice
    // under two different RSS feed labels ("Korea Herald (Sports)" and
    // "Korea Herald (Life & Culture)"), which is one independent source, not
    // two — confirmed by the writer's own notes ("SINGLE-SOURCE EVENT").
    const distinctUrls = new Set(event.sources.map((s) => s.url));
    const isSingleSource = distinctUrls.size < 2;
    if (isSingleSource) {
      singleSourceFlags.push({ rank, eventSummary: event.eventSummary });
    }

    const realEvent = realTop10ByRank.get(rank);
    const rawItemsForNgram = realEvent ? toRawItems(realEvent.sources) : [];

    const versionResults: Record<string, unknown> = {};

    for (const level of LEVELS) {
      const version = event.versions[level];
      const bodyText = version.sentences.join(" ");
      const wordEntries = toWordEntries(version.words);

      // --- wordMatch ---
      const wordMatch = checkWordMatch(bodyText, wordEntries);
      const remainingWordCount = version.words.length - wordMatch.unmatchedTerms.length;
      const belowFiveWarning = remainingWordCount < 5;

      // --- CEFR heuristic (no LLM call — ambiguous cases are recorded, not resolved) ---
      const cefr = checkCefrHeuristic(bodyText, level);

      // --- n-gram overlap vs rssSummary + source titles (partial check — no full article text available) ---
      const ngram = rawItemsForNgram.length > 0
        ? checkNgramOverlap(bodyText, rawItemsForNgram)
        : { passed: true, overlapRatio: 0, totalNgrams: 0, flaggedNgrams: [], detail: { note: "no real-top10 source match found for this rank" } };

      totalVersionsChecked++;
      if (wordMatch.passed) wordMatchPassCount++;
      if (cefr.passed) cefrPassCount++;
      if (ngram.passed) ngramPassCount++;

      versionResults[level] = {
        wordMatch: {
          passed: wordMatch.passed,
          totalWords: version.words.length,
          unmatchedTerms: wordMatch.unmatchedTerms,
          remainingWordCount,
          belowFiveWarning,
        },
        cefr: {
          passed: cefr.passed,
          score: cefr.score,
          wordCount: cefr.wordCount,
          avgSentenceLength: cefr.avgSentenceLength,
          basicWordRatio: cefr.basicWordRatio,
          advancedWordHits: cefr.advancedWordHits,
          ambiguous: cefr.ambiguous,
          note: cefr.ambiguous
            ? "heuristic ambiguous — would defer to LLMProvider.judgeCefrBand in the live pipeline; not resolved here, recorded as-is"
            : undefined,
        },
        ngram: {
          passed: ngram.passed,
          overlapRatio: ngram.overlapRatio,
          totalNgrams: ngram.totalNgrams,
          flaggedNgrams: ngram.flaggedNgrams,
          note: "PARTIAL CHECK: compared against rssSummary + source titles only (real-top10-2026-07-13.json). No fetched full-text source corpus was available for most outlets, so this cannot catch overlap against full article bodies that were fetched by the writer but are not present in this JSON.",
        },
      };
    }

    articleResults.push({
      rank,
      category: event.category,
      eventSummary: event.eventSummary,
      distinctOutletCount: distinctUrls.size,
      singleSourceFlag: isSingleSource,
      writerNotes: event.notes ?? null,
      versions: versionResults,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    editionDate: "2026-07-13",
    scope: "10 articles (event-1..event-10.json) x 3 CEFR levels (A2/B1/B2)",
    limitations: [
      "CEFR check is a heuristic (word-count band, sentence-length ceiling, basic-word ratio, advanced-marker list) per pipeline/src/gates/cefr.ts's documented limitations — not a calibrated CEFR classifier. Ambiguous results are recorded, not resolved (no LLM call made in this script).",
      "n-gram duplication check is PARTIAL: it compares against RSS summaries + source titles from real-top10-2026-07-13.json only, because full fetched article text for most sources is not present in the available JSON files. A shared phrase with an outlet's full article body (beyond its RSS blurb) would not be caught here.",
      "wordMatch failures are reported as unmatched terms only; no replacement words were invented. If dropping unmatched terms would leave fewer than 5 words for a version, that is flagged explicitly below rather than silently backfilled.",
    ],
    summary: {
      totalArticles: 10,
      totalVersionsChecked,
      wordMatch: { passRate: `${wordMatchPassCount}/${totalVersionsChecked}` },
      cefr: { passRate: `${cefrPassCount}/${totalVersionsChecked}` },
      ngram: { passRate: `${ngramPassCount}/${totalVersionsChecked}` },
      singleSourceEvents: singleSourceFlags,
    },
    articles: articleResults,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[gate-check] wrote report to ${OUTPUT_PATH}`);
  console.log(`[gate-check] wordMatch pass rate: ${wordMatchPassCount}/${totalVersionsChecked}`);
  console.log(`[gate-check] cefr pass rate: ${cefrPassCount}/${totalVersionsChecked}`);
  console.log(`[gate-check] ngram pass rate: ${ngramPassCount}/${totalVersionsChecked}`);
  if (singleSourceFlags.length > 0) {
    console.log(`[gate-check] SINGLE-SOURCE events flagged: ${singleSourceFlags.map((s) => s.rank).join(", ")}`);
  }
}

main().catch((err) => {
  console.error("[run-gate-check] fatal error", err);
  process.exitCode = 1;
});
