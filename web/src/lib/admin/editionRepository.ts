/**
 * Storage adapter contract for the admin review console (A1 §"로컬 모드
 * 우선"). Everything the console reads/writes goes through this interface so
 * the local-filesystem implementation (localFsEditionRepository.ts) can be
 * swapped for a Supabase-backed one later without touching pages/actions —
 * same pattern as web/src/lib/data/provider.ts for the public DataProvider.
 */
import type { PipelineEdition, ReviewDecision } from "./pipelineTypes";
import { localFsEditionRepository } from "./localFsEditionRepository";
import { SupabaseEditionRepository } from "./supabaseEditionRepository";

export interface EditionListItem {
  editionDate: string;
  status: PipelineEdition["status"];
  articleCount: number;
  approvedCount: number;
  excludedCount: number;
  /** Articles sent back to the pipeline for a rewrite (반려) and not yet answered. */
  regenerateCount: number;
  pendingCount: number;
  heldCount: number;
  publishedAt?: string;
}

export interface BulkApproveResult {
  approved: number;
  /** Articles deliberately left alone, with the reason. */
  skipped: Array<{ id: string; rankInEdition: number; reason: string }>;
}

export interface EditionRepository {
  /** All editions found on disk, newest date first. */
  listEditions(): Promise<EditionListItem[]>;

  getEdition(editionDate: string): Promise<PipelineEdition | null>;

  /**
   * Sets one article's operator decision. Persists immediately.
   *
   * `reason` is required for the two decisions that carry one: "excluded"
   * (why it is dropped) and "regenerate" (what the rewrite must fix — the
   * pipeline hands this note to the model, so an empty one would send the
   * article back with no instruction).
   */
  setArticleDecision(
    editionDate: string,
    articleId: string,
    decision: ReviewDecision,
    reason?: string | null
  ): Promise<PipelineEdition>;

  /** Marks the edition published (or reverts to draft — used by the manual verification/rollback step). */
  /**
   * Put one article on the front page, or clear the override with null.
   * Rejects an article that is excluded or gate-held.
   */
  setLeadArticle(editionDate: string, articleId: string | null): Promise<void>;

  /**
   * Approve every article still awaiting a decision.
   *
   * Skips gate-held articles (they cannot be approved individually either)
   * and leaves already-excluded ones excluded — a bulk action must not
   * silently reverse a decision the operator already made.
   */
  approveAllPending(editionDate: string): Promise<BulkApproveResult>;

  setEditionStatus(
    editionDate: string,
    status: PipelineEdition["status"],
    publishedAt?: string | null
  ): Promise<PipelineEdition>;
}

/**
 * The repository the console actually uses.
 *
 * Database when the desk's credentials are present, local files otherwise —
 * the same shape of choice web/src/lib/data/index.ts makes for the reader, and
 * for the same reason: the app has to work with no environment at all, and it
 * has to work deployed, without the call sites knowing which.
 *
 * SUPABASE_SERVICE_ROLE_KEY is the deciding variable rather than the reader's
 * NEXT_PUBLIC_* pair, because it is what the desk's writes require: row-level
 * security admits the anon key only to published rows, and every screen here
 * works on `review` and `held` ones.
 */
export function resolveEditionRepository(): EditionRepository {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseEditionRepository();
  }
  return localFsEditionRepository;
}

/** Which store the console is working against — for the operator-facing notice. */
export function editionRepositoryKind(): "supabase" | "local-file" {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "supabase"
    : "local-file";
}
