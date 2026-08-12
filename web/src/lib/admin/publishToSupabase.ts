import { createClient } from "@supabase/supabase-js";

/**
 * The step that actually puts an edition in front of readers.
 *
 * Everything upstream of this — the pipeline, the gates, the desk — writes
 * `review` or `held`. The row-level policies in 0001_schema.sql admit only
 * `status = 'published'`, so until something flips that column the reader's
 * anon key sees an empty table no matter how much content is in it. This is
 * that something, and it is the ONLY place in the codebase that writes
 * `published`.
 *
 * That is the design, not an accident: "승인 없이 발행 불가"
 * (a1-architecture.md §2 [7]) is enforceable precisely because there is one
 * door, it runs behind the desk's auth, and it takes an explicit list of
 * article ids the operator approved.
 *
 * Uses the SERVICE ROLE key — the anon key cannot write, by policy. That
 * key only exists on the operator's machine (web/.env.local), which is why
 * publishing is a desk action and not something the deployed site can do.
 */

export class SupabasePublishError extends Error {}

export interface SupabasePublishResult {
  /** Articles moved to `published`. */
  publishedCount: number;
  /**
   * Articles that were previously published in this edition and are no
   * longer approved — moved back to `review` so a story the operator
   * removed actually disappears from the reader instead of lingering.
   */
  withdrawnCount: number;
}

/** Configured only when both variables are present — see isSupabasePublishConfigured. */
function credentials(): { url: string; serviceRoleKey: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

export function isSupabasePublishConfigured(): boolean {
  return credentials() !== null;
}

/**
 * Flip an edition and its approved articles to `published`.
 *
 * `approvedArticleIds` are pipeline UUIDs — the same ids the pipeline wrote
 * to Supabase and the same ids the desk's JSON carries. (The seed's
 * `article-<date>-<rank>` ids are a display-layer artifact of
 * seedTransform and are NOT what the database is keyed on.)
 *
 * Idempotent: publishing the same edition twice is a no-op, and publishing
 * after un-approving a story withdraws it.
 */
export async function publishEditionToSupabase(
  editionDate: string,
  approvedArticleIds: string[]
): Promise<SupabasePublishResult> {
  const creds = credentials();
  if (!creds) {
    throw new SupabasePublishError(
      "Supabase 자격 정보가 없습니다 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). " +
        "발행은 운영자 컴퓨터에서만 가능합니다."
    );
  }
  if (approvedArticleIds.length === 0) {
    throw new SupabasePublishError("발행할 승인 기사가 없습니다.");
  }

  const db = createClient(creds.url, creds.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: edition, error: editionError } = await db
    .from("editions")
    .select("id")
    .eq("edition_date", editionDate)
    .maybeSingle();

  if (editionError) {
    throw new SupabasePublishError(`에디션 조회 실패: ${editionError.message}`);
  }
  if (!edition) {
    // The desk reads pipeline/output JSON, which can exist for a date the
    // pipeline never stored (a local STORAGE=local run). Saying so beats a
    // silent success that publishes nothing.
    throw new SupabasePublishError(
      `Supabase 에 ${editionDate} 에디션이 없습니다. ` +
        "이 날짜 파이프라인이 STORAGE=supabase 로 실행되지 않았습니다."
    );
  }

  const now = new Date().toISOString();

  // Withdraw first: if this fails we have published nothing, and a stale
  // published article is the one outcome a reader can actually notice.
  const { data: withdrawn, error: withdrawError } = await db
    .from("articles")
    .update({ status: "review", published_at: null })
    .eq("edition_id", edition.id)
    .eq("status", "published")
    .not("id", "in", `(${approvedArticleIds.join(",")})`)
    .select("id");

  if (withdrawError) {
    throw new SupabasePublishError(`이전 발행분 회수 실패: ${withdrawError.message}`);
  }

  const { data: published, error: publishError } = await db
    .from("articles")
    .update({ status: "published", published_at: now })
    .eq("edition_id", edition.id)
    .in("id", approvedArticleIds)
    .select("id");

  if (publishError) {
    throw new SupabasePublishError(`기사 발행 실패: ${publishError.message}`);
  }

  // The edition row last: an edition marked published with no published
  // articles under it would render as an empty paper.
  const { error: editionUpdateError } = await db
    .from("editions")
    .update({ status: "published", published_at: now })
    .eq("id", edition.id);

  if (editionUpdateError) {
    throw new SupabasePublishError(`에디션 상태 변경 실패: ${editionUpdateError.message}`);
  }

  return {
    publishedCount: published?.length ?? 0,
    withdrawnCount: withdrawn?.length ?? 0,
  };
}
