/**
 * Shared types for the BRIEFLY daily pipeline.
 *
 * Mirrors supabase/migrations/0001_schema.sql (A2 data model) where the
 * pipeline produces rows for those tables. Field names intentionally match
 * the DB columns so the StorageAdapter implementations are thin mappers,
 * not translators.
 */

export type CefrLevel = "A2" | "B1" | "B2";

export type ArticleStatus =
  | "ingest"
  | "generated"
  | "review"
  | "approved"
  | "published"
  | "rejected";

export type CategorySlug =
  | "world"
  | "korea"
  | "ai-tech"
  | "business"
  | "culture-sports";

// ---------------------------------------------------------------------------
// [1] RSS 수집 (collect)
// ---------------------------------------------------------------------------

export interface SourceConfig {
  /** Human-readable outlet name, e.g. "BBC World". */
  outlet: string;
  /** RSS/Atom feed URL. */
  url: string;
  /** Category this feed primarily maps to (a source can be re-tagged after clustering). */
  category: CategorySlug;
  /** Fetch method — all sources here are RSS summaries, never full-text scraping. */
  fetchMethod: "rss_summary";
  /**
   * ISO 3166-1 alpha-2 country code the outlet is edited from/represents
   * (Google News regional query → the `gl` edition, not Google's own HQ).
   * Used for World-slot regional diversity scoring (top10-curation.md §1 Layer 1).
   */
  country: string;
  /**
   * Groups multiple feeds from the same outlet (e.g. two Korea Herald
   * category feeds, or several Google News topic queries) so the 2-source
   * gate and source-dedup treat them as ONE source, not several
   * (top10-curation.md §1 Layer 1 "소스 중복 판정 강화", rank8 재발 방지).
   */
  outletKey: string;
}

/** One item pulled from an RSS/Atom feed — raw, pre-clustering. */
export interface RawItem {
  outlet: string;
  url: string;
  title: string;
  /** RSS <description>/<summary> — snippet only, never full article body. */
  summary: string;
  publishedAt: string | null; // ISO 8601, null if feed omitted it
  category: CategorySlug;
  guid: string;
  /**
   * Copied from SourceConfig.outletKey — identifies the underlying outlet
   * regardless of which feed/query produced this item, so source-dedup
   * (top10-curation.md §1 Layer 1 "소스 중복 판정 강화") can group e.g. two
   * Korea Herald category feeds or several Google News topic queries as ONE
   * source. Optional for backward compatibility with hand-built test
   * fixtures that don't set it — falls back to `outlet` in that case.
   */
  outletKey?: string;
  /**
   * Copied from SourceConfig.country — the edition/country the source
   * represents. Used for world-slot regional diversity and (heuristically)
   * for country-level political-story capping. Optional for the same
   * fixture-compatibility reason as outletKey.
   */
  country?: string;
}

export interface CollectResult {
  items: RawItem[];
  /** Per-source outcome, so partial failures don't hide silently (A1 §2 failure table). */
  sourceReport: Array<{
    outlet: string;
    url: string;
    ok: boolean;
    itemCount: number;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// [2] 사건 클러스터링 (cluster)
// ---------------------------------------------------------------------------

export interface EventCluster {
  id: string;
  /** Representative title, chosen from the item with the fullest summary. */
  title: string;
  category: CategorySlug;
  items: RawItem[];
  /**
   * Distinct SOURCES covering this event, deduped by outletKey (falling back
   * to `outlet` name when outletKey is absent) — used by the 2-source gate.
   * top10-curation.md §1 Layer 1: "같은 매체의 여러 피드/같은 URL = 1개 소스"
   * (rank8 single-source-counted-as-multiple bug fix). NOT a raw item count.
   */
  outletCount: number;
  /** Distinct outletKeys behind outletCount — kept for scoring/reporting. */
  outletKeys: string[];
  /** Distinct country/edition codes among this cluster's items. */
  countries: string[];
  earliestPublishedAt: string | null;
  /** Most recent publishedAt among this cluster's items — freshness signal (Layer 2). */
  latestPublishedAt: string | null;
}

// ---------------------------------------------------------------------------
// [3] Top 10 선정 (select)
// ---------------------------------------------------------------------------

export interface SelectedEvent extends EventCluster {
  rankInEdition: number; // 1..10
  selectionRationale: string;
}

/**
 * Per-candidate scoring + outcome record — one entry per cluster considered
 * by selectTop10Rules, whether selected, backfilled, or rejected.
 * Feeds the operator-facing selection-report JSON
 * (top10-curation.md §1 Layer 1: "모든 룰 적용 결과를 selection-report로").
 */
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
  rejectionReasons: string[];
}

/** One backfill event: a quota slot that couldn't be filled from its own category. */
export interface BackfillLogEntry {
  category: CategorySlug;
  slotIndex: number; // 1-based within that category's quota
  reason: string;
  filledFrom: CategorySlug | null; // null if the slot stayed empty
  filledByClusterId: string | null;
}

export interface SelectionReport {
  editionDate: string;
  generatedAt: string;
  quota: Record<CategorySlug, number>;
  candidates: CandidateReportEntry[];
  backfills: BackfillLogEntry[];
  finalOrder: string[]; // cluster ids, rank 1..10
  limitations: string[];
}

// ---------------------------------------------------------------------------
// [4] 사실(Fact) 추출 (extract) — maps to facts + fact_sources tables
// ---------------------------------------------------------------------------

export interface ExtractedFact {
  statement: string;
  /** outlet names (RawItem.outlet) that independently confirm this fact. */
  confirmedByOutlets: string[];
  sourceCount: number;
  usedInText: boolean;
  note?: string;
  /** true if this fact is only backed by a search-summary style snippet, never a full article body (R3 tag). */
  searchSummaryOnly: boolean;
}

export interface FactExtractionResult {
  eventId: string;
  facts: ExtractedFact[];
}

// ---------------------------------------------------------------------------
// [5] 레벨별 재작성 (rewrite) — maps to article_versions + words
// ---------------------------------------------------------------------------

export interface WordEntry {
  term: string;
  meaningKo: string;
  example: string;
  pronunciation: string;
  sortOrder: number;
  /**
   * design-decisions.md §4.8-3/4: marks a hard-but-essential word the
   * rewrite deliberately kept (rather than avoiding it to hit the CEFR
   * band) so the article's core information isn't lost. Rendered inline
   * as a small ruby-style gloss in the web app. 0-2 per level, optional —
   * absent for ordinary curated words.
   */
  isKey?: boolean;
}

export interface ArticleVersionDraft {
  level: CefrLevel;
  title: string;
  content: string;
  wordCount: number;
  words: WordEntry[];
}

export interface RewriteResult {
  eventId: string;
  versions: ArticleVersionDraft[];
}

// ---------------------------------------------------------------------------
// [6] 품질 게이트 (gate) — maps to quality_checks
// ---------------------------------------------------------------------------

export type CheckKind = "cefr" | "ngram_overlap" | "two_source" | "word_match";

export interface QualityCheckResult {
  kind: CheckKind;
  level?: CefrLevel;
  score: number | null;
  passed: boolean;
  detail: Record<string, unknown>;
}

export interface GatedVersion {
  version: ArticleVersionDraft;
  checks: QualityCheckResult[];
  passed: boolean;
  rewriteAttempts: number;
}

// ---------------------------------------------------------------------------
// Pipeline article — the unit persisted by StorageAdapter
// ---------------------------------------------------------------------------

export interface PipelineArticle {
  id: string;
  slug: string;
  category: CategorySlug;
  rankInEdition: number;
  status: ArticleStatus;
  eventSummary: string;
  sources: Array<{
    url: string;
    outlet: string;
    title: string;
    fetchMethod: "rss_summary";
  }>;
  facts: ExtractedFact[];
  versions: GatedVersion[];
  createdAt: string;
}

export interface PipelineEdition {
  id: string;
  editionDate: string; // YYYY-MM-DD
  status: "draft" | "published";
  articles: PipelineArticle[];
}

// ---------------------------------------------------------------------------
// pipeline_runs monitoring row (A1 §5.3, design-decisions §5)
// ---------------------------------------------------------------------------

export type PipelineStage =
  | "collect"
  | "cluster"
  | "select"
  | "extract"
  | "rewrite"
  | "gate"
  | "store";

export interface StageOutcome {
  stage: PipelineStage;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  detail: Record<string, unknown>;
  error?: string;
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  editionDate: string;
  status: "running" | "success" | "failed";
  stages: StageOutcome[];
  articlesProduced: number;
  errorSummary?: string;
}
