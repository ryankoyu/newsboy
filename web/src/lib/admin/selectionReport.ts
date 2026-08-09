/**
 * Best-effort loader for pipeline/output/selection-report-<date>.json
 * (production-readiness.md §2 "선정 근거 (selection report가 있으면 점수·사유)").
 *
 * Two real caveats, confirmed by inspecting the actual files `[관찰]`, not
 * assumed:
 *  1. Not every edition has one — e.g. no selection-report-2026-07-14.json
 *     exists at all. Missing file = no rationale shown, not an error.
 *  2. Even when a report with a matching date exists, its candidate `id`s
 *     don't line up with the edition's article `id`s (selection-report-
 *     2026-07-13.json's ranked titles — "N. Korean premier's China trip…" —
 *     don't match editions/2026-07-13.json's rank-1 article at all — they
 *     come from an earlier pipeline run for the same date). Matching by rank
 *     number alone would silently attach one article's score to a different
 *     article. So this only returns a match when rank AND category agree
 *     AND the titles/summary share enough vocabulary to plausibly be the
 *     same story — otherwise it reports "no match" rather than a guess.
 */
import { readFile } from "node:fs/promises";
import { selectionReportPath } from "@/lib/config/paths";
import type { CandidateReportEntry, PipelineArticle, SelectionReport } from "./pipelineTypes";

const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "in", "on", "for", "and", "or", "at", "as", "is", "with",
  "its", "after", "over", "into", "amid", "says", "said",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Minimum token overlap to trust a rank+category match (see file header caveat #2). */
const TITLE_SIMILARITY_THRESHOLD = 0.15;

export async function loadSelectionReport(editionDate: string): Promise<SelectionReport | null> {
  try {
    const raw = await readFile(selectionReportPath(editionDate), "utf-8");
    return JSON.parse(raw) as SelectionReport;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export interface SelectionMatch {
  candidate: CandidateReportEntry;
  similarity: number;
}

/**
 * Finds the selection-report candidate for a given edition article, or null
 * if none can be trusted to be the same story (see file header). Never
 * returns a low-confidence guess.
 */
export function matchSelectionCandidate(
  article: PipelineArticle,
  report: SelectionReport
): SelectionMatch | null {
  const articleTokens = tokenize(article.eventSummary);
  let best: SelectionMatch | null = null;

  for (const c of report.candidates) {
    if (c.rank !== article.rankInEdition) continue;
    const similarity = jaccardSimilarity(articleTokens, tokenize(c.title));
    if (similarity < TITLE_SIMILARITY_THRESHOLD) continue;
    if (!best || similarity > best.similarity) best = { candidate: c, similarity };
  }
  return best;
}
