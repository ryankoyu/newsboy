/**
 * SupabaseStorageAdapter — SKELETON. No Supabase project is provisioned yet
 * (task constraint #2), so this is not wired to real writes. It exists to:
 *   (a) fix the shape the pipeline will call once Supabase exists, and
 *   (b) document exactly which tables/columns each write maps to
 *       (supabase/migrations/0001_schema.sql), so a future implementer isn't
 *       guessing.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (service role,
 * not anon — the pipeline writes bypass RLS per a2-data-model.md §5:
 * "콘텐츠 쓰기는... 파이프라인은 service_role 키로만 씀").
 *
 * DO NOT use the anon/publishable key here — it cannot write to
 * status != 'published' rows under the RLS policies in 0001_schema.sql.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PipelineEdition, PipelineRun } from "../types.js";
import type { StorageAdapter } from "./adapter.js";

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly name = "supabase";
  private client: SupabaseClient;

  constructor(url?: string, serviceRoleKey?: string) {
    const supabaseUrl = url ?? process.env.SUPABASE_URL;
    const supabaseKey = serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "[SupabaseStorageAdapter] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. " +
          "This adapter is a skeleton pending Supabase project provisioning " +
          "(a1-architecture.md §6 decision list item 2). Use LocalFileStorageAdapter " +
          "until a project exists.",
      );
    }
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  async saveEdition(edition: PipelineEdition): Promise<void> {
    // TODO(supabase): implement once project exists. Mapping plan:
    //
    // 1. upsert `editions` — one row per edition.editionDate (unique constraint
    //    already on editions.edition_date). status stays 'draft' until a human
    //    approves in the admin screen; this pipeline never sets 'published'.
    //
    // 2. for each article in edition.articles:
    //    a. upsert `articles` (slug unique) with status='review' (never further —
    //       approval is done by a human in web/, per a1 §2 [7]).
    //    b. insert `sources` rows (one per RawItem the article's event drew from).
    //    c. insert `facts` rows (one per ExtractedFact), then `fact_sources`
    //       link rows for provenance (facts.source_count / fact_sources are the
    //       *only* normalized provenance path per a2-data-model.md §3 point 3).
    //    d. for each GatedVersion: insert `article_versions` (title/content/
    //       word_count), then `words` rows scoped to that version_id
    //       (a2-data-model.md §2-2: 단어는 version 종속), then `quality_checks`
    //       rows (one per QualityCheckResult) with version_id FK.
    //    e. quizzes/quiz_options are explicitly OUT of MVP scope
    //       (design-decisions.md §4.5) — do not write them here.
    //
    // 3. Use a single Postgres transaction (or Supabase RPC) per article so a
    //    partial write never leaves an article half-populated.
    //
    // 4. All writes must use the service_role client (RLS bypass) — anon/
    //    authenticated keys cannot write per 0001_schema.sql §5.
    throw new Error(
      "[SupabaseStorageAdapter.saveEdition] not implemented — see TODO block in source. " +
        "Provision a Supabase project and implement the mapping described above before use.",
    );
  }

  async recordPipelineRun(run: PipelineRun): Promise<void> {
    // TODO(supabase): `pipeline_runs` already exists in
    // supabase/migrations/0001_schema.sql (design-decisions.md §1-2), but it is
    // one row PER STAGE, not one aggregated row per run:
    //   id, run_date, stage ('ingest'|'cluster'|'select'|'extract'|'rewrite'|
    //   'gate'|'publish'), status ('running'|'success'|'failed'), error,
    //   started_at, finished_at.
    // This PipelineRun object (in-memory, one row per stage in run.stages[])
    // must be exploded into N inserts, one per StageOutcome, with run_date =
    // run.editionDate. Do not try to write run.stages as a single jsonb blob —
    // the schema doesn't have a column for that.
    throw new Error(
      "[SupabaseStorageAdapter.recordPipelineRun] not implemented — see TODO block " +
        "in source for the per-stage row mapping into the existing pipeline_runs table.",
    );
  }

  async getEdition(editionDate: string): Promise<PipelineEdition | null> {
    // TODO(supabase): select editions + nested articles/versions/words/quality_checks
    // by edition_date, reassemble into PipelineEdition shape.
    throw new Error(
      "[SupabaseStorageAdapter.getEdition] not implemented — see TODO block in source.",
    );
  }
}
