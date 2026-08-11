"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { localFsEditionRepository } from "@/lib/admin/localFsEditionRepository";
import { publishEdition, PublishError } from "@/lib/admin/publishEdition";
import { clearAdminSessionCookie, requireAdminSession } from "@/lib/admin/session";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function approveArticleAction(editionDate: string, articleId: string): Promise<ActionResult> {
  await requireAdminSession();
  try {
    await localFsEditionRepository.setArticleDecision(editionDate, articleId, "approved");
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
    await localFsEditionRepository.setArticleDecision(editionDate, articleId, "excluded", reason);
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
    await localFsEditionRepository.setArticleDecision(editionDate, articleId, "pending");
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
}

export async function publishEditionAction(editionDate: string): Promise<PublishActionResult> {
  await requireAdminSession();
  try {
    const result = await publishEdition(editionDate);
    revalidatePath(`/admin/${editionDate}`);
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/archive");
    return { ok: true, approvedCount: result.approvedCount, warnings: result.warnings };
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
    await localFsEditionRepository.setLeadArticle(editionDate, articleId);
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
    const res = await localFsEditionRepository.approveAllPending(editionDate);
    revalidatePath(`/admin/${editionDate}`);
    revalidatePath("/admin");
    return { ok: true, approved: res.approved, skipped: res.skipped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
