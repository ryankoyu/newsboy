/**
 * [5] 레벨별 재작성 (A2/B1/B2) — a1-architecture.md §2 [5].
 *
 * Rewrites from extracted facts only (never raw source text), producing all
 * three CEFR versions plus key words per version, per news-sourcing-strategy
 * §2 and a2-data-model (words are version-scoped, design-decisions §2-2).
 */

import type {
  ArticleVersionDraft,
  CategorySlug,
  CefrLevel,
  ExtractedFact,
  RewriteResult,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";

const LEVELS: CefrLevel[] = ["A2", "B1", "B2"];

export async function rewriteAllLevels(
  eventId: string,
  category: CategorySlug,
  facts: ExtractedFact[],
  llm: LLMProvider,
  feedbackByLevel: Partial<Record<CefrLevel, string>> = {},
): Promise<RewriteResult> {
  const versions: ArticleVersionDraft[] = [];

  for (const level of LEVELS) {
    const output = await llm.rewrite({
      eventId,
      category,
      facts,
      level,
      feedback: feedbackByLevel[level],
    });
    versions.push({
      level,
      title: output.title,
      content: output.content,
      wordCount: output.wordCount,
      words: output.words,
    });
  }

  return { eventId, versions };
}
