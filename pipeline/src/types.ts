/**
 * Shared types for the BRIEFLY daily pipeline.
 *
 * Mirrors supabase/migrations/0001_schema.sql (A2 data model) where the
 * pipeline produces rows for those tables. Field names intentionally match
 * the DB columns so the StorageAdapter implementations are thin mappers,
 * not translators.
 */
import type { CallUsage } from "./llm/cost.js";


export type CefrLevel = "A2" | "B1" | "B2";

export type ArticleStatus =
  | "ingest"
  | "generated"
  | "review"
  | "approved"
  | "published"
  | "rejected"
  /**
   * Post-rewrite two-source gate failure (gate.ts checkTwoSourceRule) that
   * survived MAX_REWRITE_ATTEMPTS retries. Flags the WHOLE article for human
   * review — never publish any of its 3 CEFR versions individually, since the
   * provenance problem is shared across all of them (same `facts` array).
   * See news-sourcing-strategy.md §2 rule #2 / gate 6c.
   */
  | "held";

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
  /**
   * Rank the Layer 3 편집회의 gave this candidate, or null when the LLM did
   * not name it (or the call was skipped/failed). Kept next to `outcome` so
   * an operator can see where Layer 1's rules overruled the AI's proposal —
   * top10-curation.md §1: "AI는 제안, 룰은 강제".
   */
  llmProposedRank?: number | null;
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

/**
 * One extract-stage replacement: a selected event turned out to have fewer
 * than MIN_USABLE_FACTS_TO_REWRITE two-source-confirmed facts after
 * extraction, so it was pulled before any rewrite call and swapped for the
 * next-best `heldBack` candidate in the same category (run.ts
 * replaceLowUsableFactEvents). Distinct from BackfillLogEntry, which happens
 * at *selection* time on raw outletCount — this happens at *extract* time on
 * actual fact-level corroboration, which can only be known after extraction.
 */
export interface ExtractReplacementLogEntry {
  slotIndex: number; // rankInEdition of the slot being replaced
  category: CategorySlug;
  droppedClusterId: string;
  droppedTitle: string;
  usableFactCount: number;
  minUsableFactsRequired: number;
  replacedByClusterId: string | null;
  replacedByTitle: string | null;
  /** Present when no admissible replacement existed and the slot was left empty. */
  reason?: string;
}

export interface SelectionReport {
  editionDate: string;
  generatedAt: string;
  quota: Record<CategorySlug, number>;
  candidates: CandidateReportEntry[];
  backfills: BackfillLogEntry[];
  /** Populated after extraction — see ExtractReplacementLogEntry doc comment. Empty at selection time. */
  extractReplacements?: ExtractReplacementLogEntry[];
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
  /** Usage of the Sonnet extraction call (absent for the mock provider). */
  usage?: CallUsage;
}

// ---------------------------------------------------------------------------
// [5c] 사전 뜻 (glossary) — maps to the glosses table (0006)
// ---------------------------------------------------------------------------

/**
 * A dictionary entry for one word, global rather than article-scoped.
 *
 * Deliberately thinner than WordEntry: meaning and part of speech, no example
 * and no pronunciation. The curated five per level are worth the model's full
 * attention — they carry an in-context example sentence and an IPA hint. These
 * are the other ~495 words on the page, where an invented example sentence per
 * word would multiply cost several times over to add the part a reader is
 * least likely to need mid-sentence. See pipeline/glossary.ts.
 */
export interface GlossEntry {
  /** Lowercased surface form exactly as it appears in an article body. */
  term: string;
  meaningKo: string;
  /** "n." / "v." / "adj." — omitted when the model does not supply one. */
  pos?: string;
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
  /**
   * docs/feature-status.md G9 ("Smart Dictionary에 품사 표기가 없다") /
   * a3-ui-ux.md §2-3 ("품사 + 한국어 뜻"). Short abbreviation — "n.", "v.",
   * "adj.", "adv.", "phrase" (see llm/prompts.ts WORD_RULES for the exact
   * instruction given to the model). Optional: existing seed data predates
   * this field and is NOT backfilled (design-decisions.md 규칙 1 — no
   * inventing data that wasn't generated), so downstream code must treat
   * this as possibly absent.
   */
  pos?: string;
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

export type CheckKind = "cefr" | "ngram_overlap" | "two_source" | "word_match" | "word_count";

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

export interface PipelineSourceRef {
  url: string;
  outlet: string;
  title: string;
  fetchMethod: "rss_summary";
  /**
   * The RSS snippet this source contributed. Persisted so the article can be
   * regenerated later (regenerate.ts) without re-collecting: gate.ts's
   * n-gram-overlap check compares the rewritten text against these snippets,
   * and with only titles on hand that check silently weakens to a title
   * comparison. Optional because edition files written before the operator
   * regeneration path existed don't carry it.
   */
  summary?: string;
  publishedAt?: string | null;
  /** Copied from RawItem — same regeneration-fidelity reason as `summary`. */
  outletKey?: string;
  country?: string;
}

/**
 * Operator decision recorded by the web review console
 * (production-readiness.md §2). The pipeline never writes these — it reads
 * them, in regenerate.ts, to find the articles the desk sent back.
 */
export type ReviewDecision = "pending" | "approved" | "excluded" | "regenerate";

export interface PipelineArticle {
  id: string;
  slug: string;
  category: CategorySlug;
  rankInEdition: number;
  status: ArticleStatus;
  eventSummary: string;
  sources: PipelineSourceRef[];
  facts: ExtractedFact[];
  versions: GatedVersion[];
  createdAt: string;
  /** Console-written, additive. Absent = "pending". */
  reviewDecision?: ReviewDecision;
  /** Required when reviewDecision === "excluded". */
  excludeReason?: string;
  /**
   * Required when reviewDecision === "regenerate": what the desk wants fixed.
   * Handed to the rewrite call as gate-style feedback (regenerate.ts).
   */
  regenerateNote?: string;
  regenerateRequestedAt?: string;
  /** How many times the regeneration worker has rewritten this article. */
  regenerationCount?: number;
  /** ISO timestamp of the last successful regeneration. */
  regeneratedAt?: string;
}

export interface PipelineEdition {
  id: string;
  editionDate: string; // YYYY-MM-DD
  status: "draft" | "published";
  articles: PipelineArticle[];
  /** Console-written, additive — see web/src/lib/admin/pipelineTypes.ts. */
  publishedAt?: string;
  leadArticleId?: string | null;
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
  /** [5c] Korean glosses for every tappable word — pipeline/glossary.ts. */
  | "glossary"
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
  /**
   * Estimated USD cost of this run's LLM calls, plus a per-stage token
   * breakdown — populated when the LLM provider reports usage (Anthropic;
   * absent/zero for MockLLMProvider). See llm/cost.ts UsageLedger.
   */
  costSummary?: {
    estimatedUsd: number;
    byStage: Record<
      string,
      {
        calls: number;
        costUsd: number;
        inputTokens: number;
        outputTokens: number;
        cacheCreationInputTokens: number;
        cacheReadInputTokens: number;
      }
    >;
    usedBatchApi: boolean;
  };
  /**
   * Stages this run skipped because a checkpoint from an earlier, failed run
   * of the same edition already held their output (a1 §2: "어느 단계에서
   * 죽어도 마지막 성공 지점부터 재개한다"). Their token cost belongs to that
   * earlier run, so it is NOT in this run's costSummary — a resumed run
   * reports what IT spent, not the edition's running total.
   */
  resumedStages?: PipelineStage[];
}

// ---------------------------------------------------------------------------
// Resume checkpoint (a1 §2 "각 단계는 DB에 상태를 남기고 끝난다")
// ---------------------------------------------------------------------------

/**
 * One edition's partial pipeline state, written after each stage succeeds and
 * deleted once the edition is stored.
 *
 * This is scratch state for one edition's run, not content: it exists so a
 * crash in stage [5] doesn't buy stage [2]'s thousands of Haiku same-event
 * judgments a second time. Nothing here is ever shown to a reader, and a
 * missing or stale checkpoint only costs money, never correctness — the
 * pipeline simply starts over.
 */
export interface PipelineCheckpoint {
  editionDate: string;
  /** The run that last wrote this checkpoint — for tracing, not for matching. */
  runId: string;
  updatedAt: string;
  collect?: CollectResult;
  cluster?: EventCluster[];
  select?: {
    selected: SelectedEvent[];
    heldBack: EventCluster[];
    report: SelectionReport;
  };
  extract?: {
    /** Structurally an EventToGenerate[] (pipeline/generate.ts). */
    events: Array<{
      eventId: string;
      category: CategorySlug;
      facts: ExtractedFact[];
      sourceItems: RawItem[];
    }>;
    resolvedEvents: SelectedEvent[];
    factsExtracted: number;
    factsUsedInText: number;
    replacements: ExtractReplacementLogEntry[];
  };
  /**
   * Articles already written AND gated. Appended per event, so a rewrite
   * stage that dies on event 7 of 10 keeps the six Opus drafts it paid for.
   */
  articles?: PipelineArticle[];
}
