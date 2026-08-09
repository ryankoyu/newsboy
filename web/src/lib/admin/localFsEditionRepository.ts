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
import type { EditionListItem, EditionRepository } from "./editionRepository";
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
      let pendingCount = 0;
      let heldCount = 0;
      for (const a of edition.articles) {
        const decision: ReviewDecision = a.reviewDecision ?? "pending";
        if (decision === "approved") approvedCount++;
        else if (decision === "excluded") excludedCount++;
        else pendingCount++;
        if (deriveGateStatus(a).status === "held") heldCount++;
      }
      items.push({
        editionDate: edition.editionDate,
        status: edition.status,
        articleCount: edition.articles.length,
        approvedCount,
        excludedCount,
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

  async setArticleDecision(editionDate, articleId, decision, excludeReason) {
    const edition = await readEditionFile(editionDate);
    if (!edition) throw new Error(`Edition not found: ${editionDate}`);

    const article = edition.articles.find((a) => a.id === articleId);
    if (!article) throw new Error(`Article not found in edition ${editionDate}: ${articleId}`);

    if (decision === "approved" && deriveGateStatus(article).status === "held") {
      throw new Error(
        `Article ${articleId} is held (gate failures) — cannot be approved until resolved.`
      );
    }
    if (decision === "excluded" && (!excludeReason || excludeReason.trim().length === 0)) {
      throw new Error("excludeReason is required when excluding an article.");
    }

    article.reviewDecision = decision;
    article.excludeReason = decision === "excluded" ? excludeReason!.trim() : undefined;

    await writeEditionFile(edition);
    return edition;
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
