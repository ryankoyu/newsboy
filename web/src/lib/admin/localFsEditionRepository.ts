/**
 * Local-filesystem EditionRepository — reads/writes
 * pipeline/output/editions/<date>.json directly (A1 §"로컬 모드 우선": no
 * Supabase connected yet, see docs/production-readiness.md §1). Swap for a
 * SupabaseEditionRepository later; every call site codes against
 * EditionRepository, not this class.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { assertCanLead, assertDecisionAllowed, countDecisions, verdictForBulkApprove } from "./reviewRules";
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
      items.push({
        editionDate: edition.editionDate,
        status: edition.status,
        articleCount: edition.articles.length,
        ...countDecisions(edition.articles),
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

    // Rules live in reviewRules.ts so this repository and the Supabase one
    // cannot enforce different ones.
    assertDecisionAllowed(article, decision, reason);

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
      const verdict = verdictForBulkApprove(article);
      if (!verdict.approve) {
        if (verdict.skipReason) {
          skipped.push({
            id: article.id,
            rankInEdition: article.rankInEdition,
            reason: verdict.skipReason,
          });
        }
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

    assertCanLead(article);

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
