/**
 * Resume checkpoints on the local filesystem — used by
 * LocalFileStorageAdapter only (a1 §2 "어느 단계에서 죽어도 마지막 성공
 * 지점부터 재개한다").
 *
 * Why a file here: this adapter's whole point is running without credentials,
 * and its runs happen on the machine that owns pipeline/output/. A checkpoint
 * is scratch state for one run — never read by a reader, deleted the moment
 * the edition is stored, and losing one costs a re-run but never correctness
 * — so for a local run the file is exactly the right amount of machinery.
 *
 * The Supabase adapter used to import these functions too, and that was the
 * bug: its runs are GitHub Actions jobs on throwaway runners, where the
 * checkpoint survived a retry *inside the same job* and nothing more, so a
 * re-dispatched job re-paid for every Opus rewrite. It now writes the
 * pipeline_checkpoints table (supabase/migrations/0005) instead. The rule the
 * two adapters share: put the checkpoint wherever that adapter's runs can
 * still reach it after the process dies.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelineCheckpoint } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_DIR = path.resolve(__dirname, "../../output/checkpoints");

function checkpointPath(editionDate: string): string {
  return path.join(CHECKPOINT_DIR, `${editionDate}.json`);
}

export async function writeCheckpointFile(checkpoint: PipelineCheckpoint): Promise<void> {
  await mkdir(CHECKPOINT_DIR, { recursive: true });
  await writeFile(
    checkpointPath(checkpoint.editionDate),
    JSON.stringify(checkpoint, null, 2),
    "utf-8",
  );
}

export async function readCheckpointFile(
  editionDate: string,
): Promise<PipelineCheckpoint | null> {
  try {
    const raw = await readFile(checkpointPath(editionDate), "utf-8");
    return JSON.parse(raw) as PipelineCheckpoint;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    // A corrupt checkpoint (half-written file from a hard kill) must not stop
    // the pipeline — the worst it costs is a full re-run, which is what would
    // have happened without checkpoints at all.
    return null;
  }
}

export async function removeCheckpointFile(editionDate: string): Promise<void> {
  await rm(checkpointPath(editionDate), { force: true });
}
