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
 *   pipeline/output/glosses.json                    — the dictionary, all editions
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  GlossEntry,
  PipelineCheckpoint,
  PipelineEdition,
  PipelineRun,
} from "../types.js";
import type { StorageAdapter } from "./adapter.js";
import {
  readCheckpointFile,
  removeCheckpointFile,
  writeCheckpointFile,
} from "./checkpointFile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_ROOT = path.resolve(__dirname, "../../output");
const GLOSS_FILE = path.join(OUTPUT_ROOT, "glosses.json");

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

  /** Article bodies for one edition — read straight out of the stored JSON. */
  async getVersionBodies(editionDate: string): Promise<string[]> {
    const edition = await this.getEdition(editionDate);
    if (!edition) return [];
    return edition.articles.flatMap((a) => a.versions.map((g) => g.version.content));
  }

  /**
   * One file for every edition's glosses, because the dictionary is not
   * edition-scoped — the whole point is that yesterday's words are free today.
   *
   * Read-modify-write is safe here in a way it would not be in the Supabase
   * adapter: this adapter's runs are one operator's local process, not
   * concurrent Actions jobs.
   */
  async saveGlosses(entries: readonly GlossEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await ensureDir(OUTPUT_ROOT);
    const existing = await this.readGlossFile();
    // Existing entries win: a term keeps the gloss a reader may already have
    // seen and saved.
    for (const entry of entries) {
      if (!existing[entry.term]) {
        existing[entry.term] = { meaningKo: entry.meaningKo, pos: entry.pos };
      }
    }
    const sorted = Object.fromEntries(Object.entries(existing).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(GLOSS_FILE, JSON.stringify(sorted, null, 2), "utf-8");
  }

  async loadKnownGlossTerms(): Promise<Set<string>> {
    return new Set(Object.keys(await this.readGlossFile()));
  }

  private async readGlossFile(): Promise<Record<string, { meaningKo: string; pos?: string }>> {
    try {
      return JSON.parse(await readFile(GLOSS_FILE, "utf-8"));
    } catch (err) {
      // No dictionary yet is the normal first-run state, not an error.
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }
}
