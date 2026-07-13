/**
 * [6] 품질 게이트 (자동, 불합격 시 재작성 루프) — a1-architecture.md §2 [6].
 *
 * Runs 6a (CEFR), 6b (n-gram overlap), 6c (2-source), 6d (word-body match)
 * for each level's draft. On failure, feeds back exactly which check failed
 * and re-invokes the rewrite for that level only (news-sourcing-strategy §4,
 * a1 §3.2: "게이트 불합격 시 어느 지표가 초과했는지를 다음 프롬프트에
 * 피드백"). Capped at MAX_REWRITE_ATTEMPTS; if still failing, the version is
 * flagged `passed: false` and left for human review at stage [7] rather than
 * silently publishing an over-band, overlapping, or unclickable-word text
 * (a1 §2 [6]: "초과 시 사람 검수로 보류 플래그"; design-decisions.md §4.6:
 * "단어-본문 일치를 파이프라인이 보장한다").
 */

import type {
  ArticleVersionDraft,
  CategorySlug,
  ExtractedFact,
  GatedVersion,
  QualityCheckResult,
  RawItem,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { CallUsage } from "../llm/cost.js";
import { addUsage, emptyUsage } from "../llm/cost.js";
import { checkCefr } from "../gates/cefr.js";
import { checkNgramOverlap } from "../gates/ngram.js";
import { checkTwoSourceRule } from "../gates/twoSource.js";
import { checkWordMatch } from "../gates/wordMatch.js";

export const MAX_REWRITE_ATTEMPTS = 3;

export interface GatedVersionWithUsage extends GatedVersion {
  /** Usage from any retry calls made inside this gate loop (empty if the version passed on the first try). */
  retryUsage: CallUsage;
}

function buildFeedback(checks: QualityCheckResult[]): string {
  const failed = checks.filter((c) => !c.passed);
  return failed
    .map((c) => `${c.kind} check failed (score=${c.score ?? "n/a"}): ${JSON.stringify(c.detail)}`)
    .join(" | ");
}

export async function gateVersion(
  eventId: string,
  category: CategorySlug,
  version: ArticleVersionDraft,
  facts: ExtractedFact[],
  sourceItems: RawItem[],
  llm: LLMProvider,
): Promise<GatedVersionWithUsage> {
  let currentVersion = version;
  let attempts = 0;
  let retryUsage = emptyUsage();

  while (true) {
    attempts++;

    const cefrResult = await checkCefr(currentVersion.content, currentVersion.level, llm);
    const ngramResult = checkNgramOverlap(currentVersion.content, sourceItems);
    const twoSourceResult = checkTwoSourceRule(facts);
    const wordMatchResult = checkWordMatch(currentVersion.content, currentVersion.words);

    const checks: QualityCheckResult[] = [
      {
        kind: "cefr",
        level: currentVersion.level,
        score: cefrResult.score,
        passed: cefrResult.passed,
        detail: cefrResult.detail,
      },
      {
        kind: "ngram_overlap",
        level: currentVersion.level,
        score: ngramResult.overlapRatio,
        passed: ngramResult.passed,
        detail: { ...ngramResult.detail, flaggedNgrams: ngramResult.flaggedNgrams },
      },
      {
        kind: "two_source",
        level: currentVersion.level,
        score: null,
        passed: twoSourceResult.passed,
        detail: twoSourceResult.detail,
      },
      {
        kind: "word_match",
        level: currentVersion.level,
        score: null,
        passed: wordMatchResult.passed,
        detail: { ...wordMatchResult.detail, unmatchedTerms: wordMatchResult.unmatchedTerms },
      },
    ];

    const allPassed = checks.every((c) => c.passed);

    // The 2-source check operates on `facts`, which are shared across all
    // three levels — retrying the rewrite can't fix a provenance problem.
    // If it fails, stop immediately and flag for human review rather than
    // burning rewrite attempts pointlessly.
    if (allPassed || !twoSourceResult.passed || attempts >= MAX_REWRITE_ATTEMPTS) {
      return {
        version: currentVersion,
        checks,
        passed: allPassed,
        rewriteAttempts: attempts,
        retryUsage,
      };
    }

    // Retry the failing dimensions (CEFR/n-gram/word-match) via targeted
    // feedback. two_source is excluded — it can't be fixed by a rewrite.
    // COST OPTIMIZATION: only the failing level is regenerated here (never
    // all three), and llm.rewrite() sends a compact fact summary rather than
    // the full source material — see AnthropicLLMProvider.rewrite().
    const feedback = buildFeedback(checks.filter((c) => c.kind !== "two_source"));
    const rewritten = await llm.rewrite({
      eventId,
      category,
      facts,
      level: currentVersion.level,
      feedback,
    });
    if (rewritten.usage) retryUsage = addUsage(retryUsage, rewritten.usage);
    currentVersion = {
      level: currentVersion.level,
      title: rewritten.title,
      content: rewritten.content,
      wordCount: rewritten.wordCount,
      words: rewritten.words,
    };
  }
}
