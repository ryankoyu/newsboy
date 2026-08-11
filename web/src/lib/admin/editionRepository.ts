/**
 * Storage adapter contract for the admin review console (A1 §"로컬 모드
 * 우선"). Everything the console reads/writes goes through this interface so
 * the local-filesystem implementation (localFsEditionRepository.ts) can be
 * swapped for a Supabase-backed one later without touching pages/actions —
 * same pattern as web/src/lib/data/provider.ts for the public DataProvider.
 */
import type { PipelineEdition, ReviewDecision } from "./pipelineTypes";

export interface EditionListItem {
  editionDate: string;
  status: PipelineEdition["status"];
  articleCount: number;
  approvedCount: number;
  excludedCount: number;
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

  /** Sets one article's operator decision (and optional exclude reason). Persists immediately. */
  setArticleDecision(
    editionDate: string,
    articleId: string,
    decision: ReviewDecision,
    excludeReason?: string | null
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
