/**
 * Shared TypeScript types — 1:1 mapping to the Supabase schema.
 *
 * Source of truth: supabase/migrations/0001_schema.sql
 * (which mirrors docs/design/a2-data-model.md §4).
 *
 * Keep this file in sync with the DDL. If a column is added/renamed in the
 * migration, update the corresponding type here in the same change.
 */

// =========================================================
// Enums
// =========================================================

export type CefrLevel = "A2" | "B1" | "B2";

export type ArticleStatus =
  | "ingest"
  | "generated"
  | "review"
  /**
   * Ran out of rewrite retries without clearing the two-source gate. A
   * human-reads-this terminal state like `review`, kept distinct so the desk
   * can see WHY a story is waiting. Added to the DB enum in migration 0003;
   * this union lagged it, while lib/admin/gateStatus.ts was already reading
   * the value.
   */
  | "held"
  | "approved"
  | "published"
  | "rejected";

export type EditionStatus = "draft" | "published";

export type CheckKind = "cefr" | "ngram_overlap" | "two_source" | "word_match" | "word_count";

export type FetchMethod = "full_text" | "search_summary";

// Category slugs used across seed data and design tokens (a3-ui-ux.md §0 --cat-*).
// Not an exhaustive enum in the DB (categories is a free table), but this is
// the known MVP set.
export type CategorySlug =
  | "world"
  | "korea"
  | "ai"
  | "tech"
  | "business"
  | "finance"
  | "science"
  | "sports"
  | "culture"
  | "lifestyle";

// =========================================================
// 공개 콘텐츠 (Public content)
// =========================================================

export interface Category {
  id: number;
  slug: CategorySlug | string;
  label: string;
  emoji: string | null;
  sort_order: number;
}

export interface Edition {
  id: string;
  edition_date: string; // date (YYYY-MM-DD)
  status: EditionStatus;
  published_at: string | null; // timestamptz
  created_at: string;
}

export interface Article {
  id: string;
  edition_id: string | null;
  category_id: number | null;
  slug: string;
  event_summary: string | null;
  rank_in_edition: number | null;
  status: ArticleStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A dictionary entry for one word — the fallback behind every word that is
 * not one of a version's curated `Word` rows.
 *
 * Keyed by the lowercased surface form as it appears in a body ("companies",
 * not "company"), because that is what the reader taps. Thinner than `Word`
 * on purpose: no example sentence, no pronunciation. See
 * supabase/migrations/0006_glosses.sql.
 */
export interface Gloss {
  term: string;
  meaning_ko: string;
  pos: string | null;
}

export interface ArticleVersion {
  id: string;
  article_id: string;
  level: CefrLevel;
  title: string;
  content: string; // full body, stored as one TEXT column in DB
  word_count: number | null;
  created_at: string;
  /**
   * Not a DB column — the DDL stores `content` as one TEXT blob (A2 §3-2).
   * The data layer splits it into sentences at read time for
   * sentence-level interactions (word click, Sentence Compare V1.5).
   */
  sentences: string[];
}

export interface Source {
  id: string;
  article_id: string;
  url: string;
  outlet: string | null;
  title: string | null;
  fetched_at: string;
  fetch_method: FetchMethod | string | null;
  created_at: string;
}

export interface Fact {
  id: string;
  article_id: string;
  statement: string;
  source_count: number;
  used_in_text: boolean;
  note: string | null;
  created_at: string;
}

export interface FactSource {
  fact_id: string;
  source_id: string;
  search_summary_only: boolean;
}

export interface Word {
  id: string;
  version_id: string;
  term: string;
  meaning_ko: string;
  example: string | null;
  pronunciation: string | null;
  sort_order: number;
  /**
   * design-decisions.md §4.8-3: marks a word as "hard but essential" for
   * understanding the article. At most rendered inline once (first
   * occurrence in the body) with a small ruby-style Korean gloss under it.
   * Optional — older seed data won't have this field, and the UI must not
   * error or show a ruby when it's absent/false (task constraint #6).
   */
  isKey?: boolean;
  /**
   * docs/feature-status.md G9 ("Smart Dictionary에 품사 표기가 없다") /
   * a3-ui-ux.md §2-3 ("품사 + 한국어 뜻"). Short abbreviation such as "n.",
   * "v.", "adj.", "adv.", "phrase" — see pipeline/src/llm/prompts.ts for the
   * generation instruction. Optional — no existing seed word has this field
   * (none were backfilled; see design-decisions.md 규칙 1 "지어내지 않기"),
   * and SmartDictionary must render fine without it (show if present, omit
   * if absent).
   */
  pos?: string | null;
}

// NOTE: Quiz / QuizOption types intentionally omitted — quizzes are out of
// scope for MVP per coordinator instruction (2026-07-10). The `quizzes` and
// `quiz_options` tables remain in supabase/migrations/0001_schema.sql
// (A2 design as-is) but are unused by the web app for now.

export interface QualityCheck {
  id: string;
  version_id: string;
  kind: CheckKind;
  score: number | null;
  passed: boolean;
  detail: Record<string, unknown> | null;
  checked_at: string;
}

// =========================================================
// 파이프라인 운영 (Pipeline operations)
// =========================================================

export interface PipelineRun {
  id: string;
  run_date: string; // date
  stage: string;
  status: "running" | "success" | "failed" | string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

// =========================================================
// 사용자 데이터 (User data)
// =========================================================

export interface Profile {
  id: string; // auth.users.id
  display_name: string | null;
  level: CefrLevel;
  interests: string[];
  created_at: string;
  updated_at: string;
}

export interface ReadingProgress {
  user_id: string;
  article_id: string;
  read_level: CefrLevel | null;
  completed: boolean;
  read_at: string;
}

export interface SavedWord {
  id: string;
  user_id: string;
  word_id: string | null;
  term: string;
  meaning_ko: string | null;
  created_at: string;
}

export interface Bookmark {
  user_id: string;
  article_id: string;
  created_at: string;
}

/**
 * Supabase-side shape for a saved sentence (supabase/migrations/0002_user_library.sql).
 * Not yet wired into DataProvider/SessionStore — the current implementation
 * is localStorage-backed (see src/lib/session.ts SavedSentenceEntry). This
 * type documents the eventual Supabase table shape for when auth ships.
 */
export interface SavedSentence {
  id: string;
  user_id: string;
  article_version_id: string;
  sentence_index: number;
  text_snapshot: string;
  created_at: string;
}

// =========================================================
// Composed / view-model types (not DB tables — convenience shapes
// for the data layer & UI consumption)
// =========================================================

/** An article with its versions, sources, and facts joined together. */
export interface ArticleWithDetails extends Article {
  category: Category | null;
  versions: ArticleVersion[];
  sources: Source[];
  facts: Fact[];
}

/** A full daily edition with its Top 10 articles resolved. */
export interface EditionWithArticles extends Edition {
  articles: ArticleWithDetails[];
}
