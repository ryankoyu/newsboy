/**
 * StorageAdapter — abstraction over where pipeline output lands.
 *
 * Why an interface: the pipeline has to be runnable without touching the
 * live database. SupabaseStorageAdapter (storage/supabase.ts) is the real
 * destination and writes to the provisioned project; LocalFileStorageAdapter
 * (storage/localFile.ts) writes the same shape to pipeline/output/*.json so
 * mock/dry runs — and the admin console, which still reads that directory —
 * work without credentials. STORAGE picks between them, no call-site changes.
 *
 * Field/table shapes follow docs/design/a2-data-model.md +
 * supabase/migrations/0001_schema.sql.
 */

import type {
  PipelineArticle,
  PipelineCheckpoint,
  PipelineEdition,
  PipelineRun,
} from "../types.js";

/**
 * A checkpoint older than this is ignored even for the same edition date.
 *
 * The pipeline is a daily job; a checkpoint that has sat for a day means the
 * edition is being rebuilt long after the fact, and reusing that day-old
 * collect would rebuild it from news that has since moved on. Re-collecting
 * costs a few minutes and no LLM money, so the safe direction is obvious.
 *
 * It lives here, not in the orchestrator, because two places need the same
 * number: run.ts decides whether to resume from a checkpoint, and the
 * Supabase adapter deletes expired rows so a durable store does not grow a
 * multi-megabyte payload per day forever. If the deleting side used a
 * shorter window than the resuming side, it would throw away checkpoints the
 * orchestrator would still have honoured.
 */
export const CHECKPOINT_MAX_AGE_HOURS = 24;

export interface StorageAdapter {
  readonly name: string;

  /** Persist (or update) one day's edition and its articles — status starts at 'review'. */
  saveEdition(edition: PipelineEdition): Promise<void>;

  /** Append one row to pipeline_runs — called once per run, at the end (success or failure). */
  recordPipelineRun(run: PipelineRun): Promise<void>;

  /** Read back an edition — used by verification scripts / future admin tooling. */
  getEdition(editionDate: string): Promise<PipelineEdition | null>;

  /**
   * Persist one edition's partial pipeline state so a failed run can resume
   * (a1 §2 "각 단계는 DB에 상태를 남기고 끝난다"). Called after every stage.
   *
   * Durability is the adapter's decision, and it has to match where the
   * adapter's runs happen: SupabaseStorageAdapter writes the
   * pipeline_checkpoints table (0005) because its runs are GitHub Actions
   * jobs on throwaway runners, where a local file dies with the job.
   * LocalFileStorageAdapter keeps the JSON file — its runs are on the
   * machine that owns the file.
   */
  saveCheckpoint(checkpoint: PipelineCheckpoint): Promise<void>;

  /** Most recent checkpoint for a date, or null when there is none. */
  loadCheckpoint(editionDate: string): Promise<PipelineCheckpoint | null>;

  /** Drop the checkpoint — called once the edition is safely stored. */
  clearCheckpoint(editionDate: string): Promise<void>;
}
