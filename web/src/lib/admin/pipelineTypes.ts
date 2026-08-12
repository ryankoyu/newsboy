/**
 * Types for pipeline/output/editions/<date>.json — the operator review
 * console's data source (A1 §"로컬 모드 우선").
 *
 * Deliberately duplicated from pipeline/src/types.ts (`PipelineEdition` /
 * `PipelineArticle` / ...) rather than imported: `web` and `pipeline` are
 * separate npm packages with independent tsconfigs/builds (same pattern
 * already used by web/src/lib/types.ts, which duplicates the Supabase DB
 * schema instead of importing it). Keep this file's shape in sync with
 * pipeline/src/types.ts by hand if that file's PipelineEdition/PipelineArticle
 * shapes change.
 *
 * Extends the pipeline's shape with two admin-only, additive fields the
 * pipeline itself never writes: `reviewDecision` and `excludeReason` on each
 * article, plus `publishedAt` on the edition. Old edition files without
 * these fields parse fine (all optional) — see localFsEditionRepository.ts.
 */

export type CefrLevel = "A2" | "B1" | "B2";

export type PipelineArticleStatus =
  | "ingest"
  | "generated"
  | "review"
  | "approved"
  | "published"
  | "rejected"
  | "held";

export type CategorySlug = "world" | "korea" | "ai-tech" | "business" | "culture-sports";

export type CheckKind = "cefr" | "ngram_overlap" | "two_source" | "word_match" | "word_count";

export interface QualityCheckResult {
  kind: CheckKind;
  level?: CefrLevel;
  score: number | null;
  passed: boolean;
  detail: Record<string, unknown>;
}

export interface WordEntry {
  term: string;
  meaningKo: string;
  example: string;
  pronunciation: string;
  sortOrder: number;
  isKey?: boolean;
  pos?: string;
}

export interface ArticleVersionDraft {
  level: CefrLevel;
  title: string;
  content: string;
  wordCount: number;
  words: WordEntry[];
}

export interface GatedVersion {
  version: ArticleVersionDraft;
  checks: QualityCheckResult[];
  passed: boolean;
  rewriteAttempts: number;
}

export interface ExtractedFact {
  statement: string;
  confirmedByOutlets: string[];
  sourceCount: number;
  usedInText: boolean;
  note?: string;
  searchSummaryOnly: boolean;
}

export interface PipelineSourceRef {
  url: string;
  outlet: string;
  title: string;
  fetchMethod: string;
  /** RSS snippet, kept so a regeneration can re-run the n-gram gate. Absent in older editions. */
  summary?: string;
  publishedAt?: string | null;
  outletKey?: string;
  country?: string;
}

/**
 * Operator's decision for one article, layered on top of the pipeline's own
 * `status`.
 *
 * "regenerate" is 반려 (production-readiness.md §2 "승인/반려(재생성 요청)/제외"):
 * the desk rejects this draft and asks the pipeline to write it again, with a
 * note saying what was wrong. It is not a terminal state like "excluded" —
 * pipeline/src/pipeline/regenerate.ts answers the request and returns the
 * article to "pending".
 */
export type ReviewDecision = "pending" | "approved" | "excluded" | "regenerate";

export interface PipelineArticle {
  id: string;
  slug: string;
  category: CategorySlug;
  rankInEdition: number;
  status: PipelineArticleStatus;
  eventSummary: string;
  sources: PipelineSourceRef[];
  facts: ExtractedFact[];
  versions: GatedVersion[];
  createdAt: string;
  /** Admin-only, additive (see file header). Absent = "pending". */
  reviewDecision?: ReviewDecision;
  /** Required when reviewDecision === "excluded". */
  excludeReason?: string;
  /** Required when reviewDecision === "regenerate": what the desk wants fixed. */
  regenerateNote?: string;
  /** Set when the request was filed; cleared by the pipeline once it answers. */
  regenerateRequestedAt?: string;
  /** Written by the pipeline: how many times this article has been rewritten on request. */
  regenerationCount?: number;
  regeneratedAt?: string;
}

export type PipelineEditionStatus = "draft" | "published";

export interface PipelineEdition {
  id: string;
  editionDate: string;
  status: PipelineEditionStatus;
  articles: PipelineArticle[];
  /** Admin-only, additive. Set when the edition is published from the console. */
  publishedAt?: string;
  /**
   * Admin-only, additive. The article the desk put on the front page,
   * overriding the pipeline's own rank-1 pick.
   *
   * The pipeline's ranking is a proposal; choosing the lead is the desk's
   * call. Stored as an id rather than by renumbering ranks, because article
   * ids are derived from the pipeline rank and must stay stable across
   * re-publishes. Unset (or pointing at an article that ends up excluded)
   * means the pipeline's order stands.
   */
  leadArticleId?: string | null;
}

// ---------------------------------------------------------------------------
// selection-report-<date>.json (optional — top10-curation.md §1)
// ---------------------------------------------------------------------------

export interface CandidateReportEntry {
  id: string;
  title: string;
  category: CategorySlug;
  outletCount: number;
  outletKeys: string[];
  countries: string[];
  score: number;
  scoreBreakdown: Record<string, number>;
  isPolitical: boolean;
  isCasualty: boolean;
  subjectKey: string | null;
  outcome: "selected" | "backfilled" | "rejected" | "held_back_two_source";
  rank: number | null;
  /**
   * Rank the Layer 3 편집회의 proposed for this candidate, or null/absent when
   * the LLM did not name it. A proposed rank next to outcome="rejected" is a
   * Layer 1 rule overruling the AI — top10-curation.md §1 "AI는 제안, 룰은 강제".
   */
  llmProposedRank?: number | null;
  rejectionReasons: string[];
}

export interface SelectionReport {
  editionDate: string;
  generatedAt: string;
  quota: Record<string, number>;
  candidates: CandidateReportEntry[];
  backfills: Array<{
    category: CategorySlug;
    slotIndex: number;
    reason: string;
    filledFrom: CategorySlug | null;
    filledByClusterId: string | null;
  }>;
  finalOrder: string[];
  limitations: string[];
}
