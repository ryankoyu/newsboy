import type {
  Category,
  Edition,
  EditionWithArticles,
  ArticleWithDetails,
  Word,
} from "@/lib/types";

/**
 * Data provider interface — the contract the rest of the app (pages,
 * components) codes against. Swap `seedDataProvider` for a Supabase-backed
 * implementation later without touching call sites.
 *
 * Scope note (2026-07-10): quizzes are out of MVP scope, so no quiz methods
 * are defined here.
 */
export interface DataProvider {
  getCategories(): Promise<Category[]>;
  getLatestEdition(): Promise<EditionWithArticles | null>;
  getEditionByDate(editionDate: string): Promise<EditionWithArticles | null>;
  getArticleBySlug(slug: string): Promise<ArticleWithDetails | null>;
  getWordsForVersion(versionId: string): Promise<Word[]>;
  /**
   * All published editions, newest first (enhancement-plan.md Batch 1 #4 —
   * /archive). Lightweight (no articles resolved) — callers that need
   * articles for a specific date should follow up with getEditionByDate.
   */
  listEditions(): Promise<Edition[]>;
}

/**
 * wpm assumptions per CEFR level, per design-decisions.md §4-5 /
 * a3-ui-ux.md §0 & line 272 ("A2 ~90wpm, B1 ~120wpm, B2 ~150wpm", draft —
 * subject to adjustment from real usage data).
 */
const WPM_BY_LEVEL: Record<"A2" | "B1" | "B2", number> = {
  A2: 90,
  B1: 120,
  B2: 150,
};

/**
 * Estimated reading time in minutes, rounded up, minimum "1 min"
 * (a3-ui-ux.md §0 line 272).
 */
export function estimateReadingMinutes(
  level: "A2" | "B1" | "B2",
  wordCount: number | null
): number {
  if (!wordCount || wordCount <= 0) return 1;
  const wpm = WPM_BY_LEVEL[level];
  return Math.max(1, Math.ceil(wordCount / wpm));
}
