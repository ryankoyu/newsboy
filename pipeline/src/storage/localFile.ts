/**
 * LocalFileStorageAdapter — writes pipeline output to pipeline/output/*.json.
 *
 * Used for the demo/e2e run (task constraint #2 — no Supabase provisioned
 * yet). Output shape mirrors the DB schema (a2-data-model.md +
 * supabase/migrations/0001_schema.sql) field-for-field where practical, so
 * a future migration to SupabaseStorageAdapter is a mapping exercise, not a
 * redesign.
 *
 * Files written per run:
 *   pipeline/output/editions/<edition_date>.json   — the edition + articles (status='review')
 *   pipeline/output/runs/<run_id>.json              — pipeline_runs row
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelineEdition, PipelineRun } from "../types.js";
import type { StorageAdapter } from "./adapter.js";

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
}
