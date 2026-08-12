/**
 * Local-filesystem EditionRepository — reads/writes
 * pipeline/output/editions/<date>.json directly (A1 §"로컬 모드 우선": no
 * Supabase connected yet, see docs/production-readiness.md §1). Swap for a
 * SupabaseEditionRepository later; every call site codes against
 * EditionRepository, not this class.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { deriveGateStatus } from "./gateStatus";
import { editionFilePath, PIPELINE_EDITIONS_DIR } from "@/lib/config/paths";
import type { EditionListItem, EditionRepository, BulkApproveResult } from "./editionRepository";
import type { PipelineEdition, ReviewDecision } from "./pipelineTypes";

async function readEditionFile(editionDate: string): Promise<PipelineEdition | null> {
  try {
    const raw = await readFile(editionFilePath(editionDate), "utf-8");
    return JSON.parse(raw) as PipelineEdition;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeEditionFile(edition: PipelineEdition): Promise<void> {
  await mkdir(PIPELINE_EDITIONS_DIR, { recursive: true });
  await writeFile(editionFilePath(edition.editionDate), JSON.stringify(edition, null, 2) + "\n", "utf-8");
}

export const localFsEditionRepository: EditionRepository = {
  async listEditions() {
    let files: string[];
    try {
      files = await readdir(PIPELINE_EDITIONS_DIR);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }

    const dates = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)); // newest first

    const items: EditionListItem[] = [];
    for (const date of dates) {
      const edition = await readEditionFile(date);
      if (!edition) continue;
      let approvedCount = 0;
      let excludedCount = 0;
      let regenerateCount = 0;
      let pendingCount = 0;
      let heldCount = 0;
      for (const a of edition.articles) {
        const decision: ReviewDecision = a.reviewDecision ?? "pending";
        if (decision === "approved") approvedCount++;
        else if (decision === "excluded") excludedCount++;
        else if (decision === "regenerate") regenerateCount++;
        else pendingCount++;
        if (deriveGateStatus(a).status === "held") heldCount++;
      }
      items.push({
        editionDate: edition.editionDate,
        status: edition.status,
        articleCount: edition.articles.length,
        approvedCount,
        excludedCount,
        regenerateCount,
        pendingCount,
        heldCount,
        publishedAt: edition.publishedAt,
      });
    }
    return items;
  },

  async getEdition(editionDate) {
    return readEditionFile(editionDate);
  },

  async setArticleDecision(editionDate, articleId, decision, reason) {
    const edition = await readEditionFile(editionDate);
    if (!edition) throw new Error(`Edition not found: ${editionDate}`);

    const article = edition.articles.find((a) => a.id === articleId);
    if (!article) throw new Error(`Article not found in edition ${editionDate}: ${articleId}`);

    if (decision === "approved" && deriveGateStatus(article).status === "held") {
      throw new Error(
        `Article ${articleId} is held (gate failures) — cannot be approved until resolved.`
      );
    }
    if (decision === "excluded" && (!reason || reason.trim().length === 0)) {
      throw new Error("excludeReason is required when excluding an article.");
    }
    // A 반려 with no note is a rejection the pipeline cannot act on: the note
    // IS the instruction handed to the rewrite (regenerate.ts).
    if (decision === "regenerate" && (!reason || reason.trim().length === 0)) {
      throw new Error("regenerateNote is required when requesting a rewrite.");
    }
    // Deliberately NOT blocked for held articles: a gate-held article can
    // never be approved, so asking for a rewrite is its only way forward.

    article.reviewDecision = decision;
    article.excludeReason = decision === "excluded" ? reason!.trim() : undefined;
    if (decision === "regenerate") {
      article.regenerateNote = reason!.trim();
      article.regenerateRequestedAt = new Date().toISOString();
    } else {
      // Clearing only the timestamp keeps the last note visible as history
      // ("이 기사는 이런 이유로 한 번 다시 썼다") while marking the request
      // itself as no longer outstanding — the pipeline keys off the decision.
      article.regenerateRequestedAt = undefined;
    }

    await writeEditionFile(edition);
    return edition;
  },

  async approveAllPending(editionDate) {
    const edition = await readEditionFile(editionDate);
    if (!edition) throw new Error(`Edition not found: ${editionDate}`);

    const skipped: BulkApproveResult["skipped"] = [];
    let approved = 0;

    for (const article of edition.articles) {
      const decision = article.reviewDecision ?? "pending";
      // An operator's own exclusion is a decision, not an absence of one —
      // a bulk approve must not quietly undo it.
      if (decision === "excluded") {
        skipped.push({
          id: article.id,
          rankInEdition: article.rankInEdition,
          reason: "이미 제외함",
        });
        continue;
      }
      // Same reasoning for 반려: the operator asked for a rewrite, and bulk
      // approval must not approve the very draft they rejected.
      if (decision === "regenerate") {
        skipped.push({
          id: article.id,
          rankInEdition: article.rankInEdition,
          reason: "재생성 요청 대기 중",
        });
        continue;
      }
      if (decision === "approved") continue;
      // Same bar as approving one by one: a held article needs a human to
      // resolve the gate failure first.
      if (deriveGateStatus(article).status === "held") {
        skipped.push({
          id: article.id,
          rankInEdition: article.rankInEdition,
          reason: "보류(held) — 게이트 미통과",
        });
        continue;
      }
      article.reviewDecision = "approved";
      article.excludeReason = undefined;
      approved += 1;
    }

    // One write for the whole batch rather than one per article.
    await writeEditionFile(edition);
    return { approved, skipped };
  },
  async setLeadArticle(editionDate, articleId) {
    const edition = await readEditionFile(editionDate);
    if (!edition) throw new Error(`Edition not found: ${editionDate}`);

    if (articleId === null) {
      edition.leadArticleId = null;
      await writeEditionFile(edition);
      return;
    }

    const article = edition.articles.find((x) => x.id === articleId);
    if (!article) throw new Error(`Article not found in edition ${editionDate}: ${articleId}`);

    // The front page is the most-read slot in the edition, so it takes the
    // same bars as approval: a gate-held or excluded story cannot lead.
    if (deriveGateStatus(article).status === "held") {
      throw new Error("보류(held) 상태인 기사는 1면으로 지정할 수 없습니다.");
    }
    if (article.reviewDecision === "excluded") {
      throw new Error("제외한 기사는 1면으로 지정할 수 없습니다.");
    }
    if (article.reviewDecision === "regenerate") {
      throw new Error("재생성 요청 중인 기사는 1면으로 지정할 수 없습니다.");
    }

    edition.leadArticleId = articleId;
    await writeEditionFile(edition);
  },

  async setEditionStatus(editionDate, status, publishedAt) {
    const edition = await readEditionFile(editionDate);
    if (!edition) throw new Error(`Edition not found: ${editionDate}`);

    edition.status = status;
    if (status === "published") {
      edition.publishedAt = publishedAt ?? new Date().toISOString();
    } else {
      edition.publishedAt = undefined;
    }

    await writeEditionFile(edition);
    return edition;
  },
};
