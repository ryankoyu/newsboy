/**
 * [5] 레벨별 재작성 (A2/B1/B2) — a1-architecture.md §2 [5].
 *
 * Rewrites from extracted facts only (never raw source text), producing all
 * three CEFR versions plus key words per version, per news-sourcing-strategy
 * §2 and a2-data-model (words are version-scoped, design-decisions §2-2).
 *
 * COST OPTIMIZATION (2026-07-13): the initial draft for all three levels now
 * comes from ONE call (llm.generateAllLevels) instead of three separate
 * llm.rewrite() calls — source facts are sent once per event, not 3x. Per-
 * level gate-failure retries still use llm.rewrite() (see gate.ts), which
 * sends a compact fact summary rather than the full fact list.
 */

import type {
  ArticleVersionDraft,
  CategorySlug,
  CefrLevel,
  ExtractedFact,
  RewriteResult,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { CallUsage } from "../llm/cost.js";
import { addUsage, emptyUsage } from "../llm/cost.js";

const LEVELS: CefrLevel[] = ["A2", "B1", "B2"];

export interface RewriteAllLevelsResult extends RewriteResult {
  usage: CallUsage;
}

export async function rewriteAllLevels(
  eventId: string,
  category: CategorySlug,
  facts: ExtractedFact[],
  llm: LLMProvider,
): Promise<RewriteAllLevelsResult> {
  const result = await llm.generateAllLevels({ eventId, category, facts });

  let usage = emptyUsage();
  const versions: ArticleVersionDraft[] = LEVELS.map((level) => {
    const output = result.versions[level];
    if (output.usage) usage = addUsage(usage, output.usage);
    return {
      level,
      title: output.title,
      content: output.content,
      wordCount: output.wordCount,
      words: output.words,
    };
  });
  if (result.usage) usage = addUsage(usage, result.usage);

  return { eventId, versions, usage };
}
