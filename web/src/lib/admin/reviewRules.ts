import { deriveGateStatus } from "./gateStatus";
import type { PipelineArticle, ReviewDecision } from "./pipelineTypes";

/**
 * What the desk is and is not allowed to decide.
 *
 * These rules used to live inside localFsEditionRepository, which was fine
 * while there was one repository. There are two now — the local files an
 * operator's own machine holds, and the database a deployed console reads —
 * and a rule that exists twice is a rule that will eventually be enforced
 * once. The dangerous direction is obvious: the *deployed* console is the one
 * that would quietly let a gate-held article through.
 *
 * So the rules live here, as pure functions over an article, and both
 * repositories call them. Nothing in this file touches storage.
 */

/** Thrown for a decision the desk may not make. Message is shown to the operator. */
export class ReviewRuleError extends Error {}

/**
 * Guards one article-level decision.
 *
 * The two reason-required rules are not validation for its own sake:
 * an exclusion with no reason cannot be understood by anyone reading the
 * edition later, and a 반려 with no note is handed to the rewrite as its
 * instruction — an empty one sends the article back to the model saying
 * nothing (pipeline/src/pipeline/regenerate.ts).
 */
export function assertDecisionAllowed(
  article: PipelineArticle,
  decision: ReviewDecision,
  reason: string | null | undefined,
): void {
  if (decision === "approved" && deriveGateStatus(article).status === "held") {
    throw new ReviewRuleError(
      `Article ${article.id} is held (gate failures) — cannot be approved until resolved.`,
    );
  }
  if (decision === "excluded" && !reason?.trim()) {
    throw new ReviewRuleError("excludeReason is required when excluding an article.");
  }
  if (decision === "regenerate" && !reason?.trim()) {
    throw new ReviewRuleError("regenerateNote is required when requesting a rewrite.");
  }
  // A rewrite request is deliberately NOT blocked for a held article: it can
  // never be approved, so asking for a rewrite is its only way forward.
}

export type BulkApproveVerdict = { approve: boolean; skipReason?: string };

/**
 * What a bulk approve should do with one article.
 *
 * The two skips exist because a bulk action must not quietly reverse a
 * decision the operator already made by hand — an exclusion and a rewrite
 * request are both decisions, not absences of one.
 */
export function verdictForBulkApprove(article: PipelineArticle): BulkApproveVerdict {
  const decision: ReviewDecision = article.reviewDecision ?? "pending";
  if (decision === "excluded") return { approve: false, skipReason: "이미 제외함" };
  if (decision === "regenerate") return { approve: false, skipReason: "재생성 요청 대기 중" };
  // Already approved: nothing to do and nothing to report.
  if (decision === "approved") return { approve: false };
  if (deriveGateStatus(article).status === "held") {
    return { approve: false, skipReason: "보류(held) — 게이트 미통과" };
  }
  return { approve: true };
}

/**
 * Guards the front-page slot.
 *
 * The lead is the most-read position in the edition, so it takes the same
 * bars as approval and then some: a story the desk excluded or sent back
 * cannot be the first thing a reader sees.
 */
export function assertCanLead(article: PipelineArticle): void {
  if (deriveGateStatus(article).status === "held") {
    throw new ReviewRuleError("보류(held) 상태인 기사는 1면으로 지정할 수 없습니다.");
  }
  if (article.reviewDecision === "excluded") {
    throw new ReviewRuleError("제외한 기사는 1면으로 지정할 수 없습니다.");
  }
  if (article.reviewDecision === "regenerate") {
    throw new ReviewRuleError("재생성 요청 중인 기사는 1면으로 지정할 수 없습니다.");
  }
}

/** Per-decision counts for one edition — the numbers the console's list shows. */
export function countDecisions(articles: readonly PipelineArticle[]) {
  let approvedCount = 0;
  let excludedCount = 0;
  let regenerateCount = 0;
  let pendingCount = 0;
  let heldCount = 0;
  for (const a of articles) {
    const decision: ReviewDecision = a.reviewDecision ?? "pending";
    if (decision === "approved") approvedCount++;
    else if (decision === "excluded") excludedCount++;
    else if (decision === "regenerate") regenerateCount++;
    else pendingCount++;
    // Counted independently of the decision: "held" describes the gate, not
    // the desk, and an article can be both held and awaiting a decision.
    if (deriveGateStatus(a).status === "held") heldCount++;
  }
  return { approvedCount, excludedCount, regenerateCount, pendingCount, heldCount };
}
