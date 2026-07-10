/**
 * StorageAdapter — abstraction over where pipeline output lands.
 *
 * Why an interface: no Supabase project is provisioned yet (task constraint
 * #2). LocalFileStorageAdapter (storage/localFile.ts) writes the same shape
 * that would go into Supabase tables, to pipeline/output/*.json, so the
 * pipeline is runnable and inspectable today. SupabaseStorageAdapter
 * (storage/supabase.ts) is a skeleton with TODOs for the real writes — swap
 * it in once a project + service-role key exist, no call-site changes needed.
 *
 * Field/table shapes follow docs/design/a2-data-model.md +
 * supabase/migrations/0001_schema.sql.
 */

import type { PipelineArticle, PipelineEdition, PipelineRun } from "../types.js";

export interface StorageAdapter {
  readonly name: string;

  /** Persist (or update) one day's edition and its articles — status starts at 'review'. */
  saveEdition(edition: PipelineEdition): Promise<void>;

  /** Append one row to pipeline_runs — called once per run, at the end (success or failure). */
  recordPipelineRun(run: PipelineRun): Promise<void>;

  /** Read back an edition — used by verification scripts / future admin tooling. */
  getEdition(editionDate: string): Promise<PipelineEdition | null>;
}
