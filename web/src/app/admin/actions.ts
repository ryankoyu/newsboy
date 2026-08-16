"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveEditionRepository } from "@/lib/admin/editionRepository";
import { publishEdition, PublishError } from "@/lib/admin/publishEdition";
import { clearAdminSessionCookie, requireAdminSession } from "@/lib/admin/session";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function approveArticleAction(editionDate: string, articleId: string): Promise<ActionResult> {
  await requireAdminSession();
  try {
    await resolveEditionRepository().setArticleDecision(editionDate, articleId, "approved");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/admin/${editionDate}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function excludeArticleAction(
  editionDate: string,
  articleId: string,
  reason: string
): Promise<ActionResult> {
  await requireAdminSession();
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: "제외 사유를 입력해 주세요." };
  }
  try {
    await resolveEditionRepository().setArticleDecision(editionDate, articleId, "excluded", reason);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/admin/${editionDate}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 반려 — send one article back to the pipeline to be written again
 * (production-readiness.md §2 "기사별 승인/반려(재생성 요청)/제외").
 *
 * The note is not commentary: pipeline/src/pipeline/regenerate.ts hands it to
 * the rewrite call as the instruction for the new draft, which is why an
 * empty one is refused here as well as in the repository. Nothing is
 * regenerated inside this request — the console records the request and the
 * pipeline worker (npm run regenerate -- <date>) answers it, because a
 * three-level Opus rewrite is minutes of work, not a button's worth.
 */
export async function requestRegenerationAction(
  editionDate: string,
  articleId: string,
  note: string
): Promise<ActionResult> {
  await requireAdminSession();
  if (!note || note.trim().length === 0) {
    return { ok: false, error: "재생성 요청 사유를 입력해 주세요. (무엇을 고쳐야 하는지)" };
  }
  try {
    await resolveEditionRepository().setArticleDecision(editionDate, articleId, "regenerate", note);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/admin/${editionDate}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function resetArticleDecisionAction(
  editionDate: string,
  articleId: string
): Promise<ActionResult> {
  await requireAdminSession();
  try {
    await resolveEditionRepository().setArticleDecision(editionDate, articleId, "pending");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/admin/${editionDate}`);
  revalidatePath("/admin");
  return { ok: true };
}

export interface PublishActionResult extends ActionResult {
  approvedCount?: number;
  warnings?: string[];
  /**
   * Whether this publish actually changed what readers see. False when
   * Supabase is not configured — the seed was rewritten and nothing else,
   * which is a materially different outcome and must not read as success.
   */
  reachedReaders?: boolean;
  /** Articles now live for readers. Undefined when reachedReaders is false. */
  publishedCount?: number;
}

export async function publishEditionAction(editionDate: string): Promise<PublishActionResult> {
  await requireAdminSession();
  try {
    const result = await publishEdition(editionDate);
    revalidatePath(`/admin/${editionDate}`);
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/archive");
    return {
      ok: true,
      approvedCount: result.approvedCount,
      warnings: result.warnings,
      // Boolean(), not `!== null`: an undefined field would otherwise report
      // that readers saw the edition. This claim only ever gets to be true
      // when there is a Supabase result proving it.
      reachedReaders: Boolean(result.supabase),
      publishedCount: result.supabase?.publishedCount,
    };
  } catch (err) {
    if (err instanceof PublishError) return { ok: false, error: err.message };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function logoutAction(): Promise<void> {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}

/**
 * Put one article on the front page, or clear the override with null.
 *
 * The pipeline's ranking is a proposal — leadScore.ts orders the ten by reach
 * and stakes — but which story leads is an editorial call, so the desk gets
 * the final say here.
 */
export async function setLeadArticleAction(
  editionDate: string,
  articleId: string | null
): Promise<ActionResult> {
  await requireAdminSession();
  try {
    await resolveEditionRepository().setLeadArticle(editionDate, articleId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  revalidatePath(`/admin/${editionDate}`);
  revalidatePath("/admin");
  return { ok: true };
}

export interface BulkApproveActionResult extends ActionResult {
  approved?: number;
  skipped?: Array<{ id: string; rankInEdition: number; reason: string }>;
}

/**
 * Approve every article still awaiting a decision.
 *
 * Held articles are skipped and already-excluded ones are left excluded, so
 * this saves clicks without reversing a judgement the operator has made or
 * bypassing the gate bar that individual approval enforces.
 */
export async function approveAllPendingAction(
  editionDate: string
): Promise<BulkApproveActionResult> {
  await requireAdminSession();
  try {
    const res = await resolveEditionRepository().approveAllPending(editionDate);
    revalidatePath(`/admin/${editionDate}`);
    revalidatePath("/admin");
    return { ok: true, approved: res.approved, skipped: res.skipped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
