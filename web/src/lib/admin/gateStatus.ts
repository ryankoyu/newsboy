/**
 * Derives a human-facing "does this article need operator attention" status
 * from the pipeline's own gate results — production-readiness.md §2 ("품질
 * 게이트 결과 표시"), a1-architecture.md §2 [7] ("사람 최종 승인").
 *
 * Why derived, not just `article.status === "held"`: real pipeline output
 * (pipeline/output/editions/2026-07-13.json rank 1, 2026-07-14.json rank 8)
 * shows articles left at status "review" with a version whose gate checks
 * still failed after the rewrite-retry loop was exhausted — the pipeline's
 * "held" status (pipeline/src/types.ts) is only set for a surviving
 * two-source failure, not every gate kind. The review console can't trust
 * `status` alone to know what needs a human's eyes, so it re-checks every
 * version's checks directly. `[관찰]` confirmed against both real edition
 * files, not assumed from the type comment alone.
 */
import type {
  CheckKind,
  GatedVersion,
  PipelineArticle,
  QualityCheckResult,
} from "./pipelineTypes";

export type GateStatus = "clear" | "held";

export interface GateStatusResult {
  status: GateStatus;
  /** Human-readable reasons, e.g. "B1: cefr 게이트 실패". Empty when status is "clear". */
  reasons: string[];
}

/** All check kinds the review UI knows how to badge (production-readiness.md §2). */
export const ALL_CHECK_KINDS: CheckKind[] = [
  "cefr",
  "ngram_overlap",
  "two_source",
  "word_match",
  "word_count",
];

export type CheckBadgeState = "pass" | "fail" | "ambiguous" | "not_run";

/**
 * Per-check badge state. "ambiguous" surfaces the cefr heuristic's own
 * `detail.heuristic.ambiguous` flag (gates/cefr.ts) — a check that passed
 * its numeric bands but flagged itself as needing human judgment. "not_run"
 * means this check kind isn't present on this version at all (e.g. neither
 * real edition file has a `word_count` check — that gate was added after
 * both runs; see pipeline/src/gates/wordCount.ts header). Never invented as
 * pass/fail — shown honestly as "not run" instead.
 */
export function checkBadgeState(check: QualityCheckResult | undefined): CheckBadgeState {
  if (!check) return "not_run";
  const heuristic = (check.detail as { heuristic?: { ambiguous?: boolean } } | null)?.heuristic;
  if (heuristic?.ambiguous) return "ambiguous";
  return check.passed ? "pass" : "fail";
}

export function findCheck(version: GatedVersion, kind: CheckKind): QualityCheckResult | undefined {
  return version.checks.find((c) => c.kind === kind);
}

export function deriveGateStatus(article: PipelineArticle): GateStatusResult {
  const reasons: string[] = [];

  if (article.status === "held") {
    reasons.push(
      "파이프라인이 이 기사를 held로 표시함 (2소스 검증 게이트가 재작성 재시도 후에도 통과하지 못함)"
    );
  }

  for (const v of article.versions) {
    const failedKinds = v.checks.filter((c) => !c.passed).map((c) => c.kind);
    if (failedKinds.length > 0) {
      reasons.push(`${v.version.level}: ${failedKinds.join(", ")} 게이트 실패`);
    }
    const ambiguousKinds = v.checks
      .filter((c) => c.passed && checkBadgeState(c) === "ambiguous")
      .map((c) => c.kind);
    if (ambiguousKinds.length > 0) {
      reasons.push(`${v.version.level}: ${ambiguousKinds.join(", ")} 판정 애매(보류) — 확인 필요`);
    }
  }

  return { status: reasons.length > 0 ? "held" : "clear", reasons };
}
