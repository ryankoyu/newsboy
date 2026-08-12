/**
 * LocalFileStorageAdapter — writes pipeline output to pipeline/output/*.json.
 *
 * Used for mock/dry runs, and read directly by the admin review console.
 * Output shape mirrors the DB schema (a2-data-model.md +
 * supabase/migrations/0001_schema.sql) field-for-field where practical, so
 * the two adapters stay swappable — SupabaseStorageAdapter writes the same
 * fields to the live project.
 *
 * Files written per run:
 *   pipeline/output/editions/<edition_date>.json   — the edition + articles (status='review')
 *   pipeline/output/runs/<run_id>.json              — pipeline_runs row
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelineCheckpoint, PipelineEdition, PipelineRun } from "../types.js";
import type { StorageAdapter } from "./adapter.js";
import {
  readCheckpointFile,
  removeCheckpointFile,
  writeCheckpointFile,
} from "./checkpointFile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.resolve(__dirname, "../../output");

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export class LocalFileStorageAdapter implements StorageAdapter {
  readonly name = "local-file";

  async saveEdition(edition: PipelineEdition): Promise<void> {
    const dir = path.join(OUTPUT_ROOT, "editions");
    await ensureDir(dir);
    const filePath = path.join(dir, `${edition.editionDate}.json`);
    await writeFile(filePath, JSON.stringify(edition, null, 2), "utf-8");
  }

  async recordPipelineRun(run: PipelineRun): Promise<void> {
    const dir = path.join(OUTPUT_ROOT, "runs");
    await ensureDir(dir);
    const filePath = path.join(dir, `${run.id}.json`);
    await writeFile(filePath, JSON.stringify(run, null, 2), "utf-8");
  }

  async getEdition(editionDate: string): Promise<PipelineEdition | null> {
    const filePath = path.join(OUTPUT_ROOT, "editions", `${editionDate}.json`);
    try {
      const raw = await readFile(filePath, "utf-8");
      return JSON.parse(raw) as PipelineEdition;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  // Resume checkpoints live in pipeline/output/checkpoints/. A file is the
  // right store for *this* adapter — its runs happen on the machine that owns
  // that directory. The Supabase adapter deliberately does not share it; see
  // checkpointFile.ts.
  async saveCheckpoint(checkpoint: PipelineCheckpoint): Promise<void> {
    await writeCheckpointFile(checkpoint);
  }

  async loadCheckpoint(editionDate: string): Promise<PipelineCheckpoint | null> {
    return readCheckpointFile(editionDate);
  }

  async clearCheckpoint(editionDate: string): Promise<void> {
    await removeCheckpointFile(editionDate);
  }
}
