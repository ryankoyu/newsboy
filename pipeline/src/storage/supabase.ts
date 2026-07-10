/**
 * SupabaseStorageAdapter — writes pipeline output into the real Supabase
 * schema (supabase/migrations/0001_schema.sql). No Supabase project is
 * provisioned yet (task constraint), so this has never been run against a
 * live database — it is verified with a query-builder-mocking unit test
 * (storage/supabase.test.ts) that asserts the exact table/column mapping,
 * not with a network integration test.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (service role,
 * not anon — the pipeline writes bypass RLS per a2-data-model.md §5:
 * "콘텐츠 쓰기는... 파이프라인은 service_role 키로만 씀").
 *
 * DO NOT use the anon/publishable key here — it cannot write to
 * status != 'published' rows under the RLS policies in 0001_schema.sql.
 *
 * ---------------------------------------------------------------------------
 * IDEMPOTENCY STRATEGY (same-day re-run):
 *
 * editions.edition_date has a UNIQUE constraint, and articles.slug is unique
 * (globally, not per-edition) — see 0001_schema.sql. A second run for the
 * same edition_date must not create duplicate rows. Strategy:
 *
 *   1. `editions` — upsert on edition_date. Same edition row is reused/updated
 *      across re-runs of the same day.
 *   2. `articles` — "replace" strategy, not upsert-by-slug: for a re-run of an
 *      edition, we first delete all existing articles whose edition_id
 *      matches this edition (cascade deletes article_versions/sources/facts/
 *      fact_sources/words/quality_checks via FK on delete cascade), then
 *      insert the fresh set. Rationale: slugs are derived from titles that
 *      can change between runs (rewrite is non-deterministic), so upserting
 *      by slug could silently leave stale sibling rows (old slug orphaned)
 *      while inserting a new one. Delete-then-insert per edition guarantees
 *      the edition's article set exactly matches this run's output, and the
 *      cascade means we never have to hand-delete every child table.
 *   3. `pipeline_runs` — always inserted fresh (append-only monitoring log,
 *      never updated/deduped — every run, including re-runs, is its own
 *      audit trail entry).
 *
 * This is a "replace" strategy rather than field-level upsert because the
 * pipeline's unit of re-run is "the whole edition for a day," not individual
 * articles — matches how run.ts always regenerates the full Top 10 from
 * scratch.
 * ---------------------------------------------------------------------------
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ArticleStatus,
  CheckKind,
  ExtractedFact,
  GatedVersion,
  PipelineArticle,
  PipelineEdition,
  PipelineRun,
  WordEntry,
} from "../types.js";
import type { StorageAdapter } from "./adapter.js";

/**
 * Article status this adapter is ever allowed to write. Enforced defensively
 * even though PipelineArticle.status is already typed 'review' at the
 * call site (run.ts) — the pipeline must NEVER auto-publish
 * (a1 §2: "사람 승인 없이는 절대 발행되지 않는다"; task constraint: "'approved'/
 * 'published' 쓰는 코드 금지").
 */
const ALLOWED_ARTICLE_STATUS: ArticleStatus = "review";
const ALLOWED_EDITION_STATUS = "draft";

function assertNeverAutoPublish(status: string, kind: "article" | "edition"): void {
  const allowed = kind === "article" ? ALLOWED_ARTICLE_STATUS : ALLOWED_EDITION_STATUS;
  if (status !== allowed) {
    throw new Error(
      `[SupabaseStorageAdapter] refusing to write ${kind} status='${status}' — ` +
        `this adapter may only write status='${allowed}'. Approval/publish is a ` +
        `human action performed in web/ admin, never by the pipeline.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Row shapes (mirrors supabase/migrations/0001_schema.sql column names)
// ---------------------------------------------------------------------------

interface EditionRow {
  id: string;
  edition_date: string;
  status: "draft" | "published";
}

interface ArticleRow {
  id: string;
  edition_id: string;
  category_id: number | null;
  slug: string;
  event_summary: string;
  rank_in_edition: number;
  status: ArticleStatus;
}

interface SourceRow {
  article_id: string;
  url: string;
  outlet: string;
  title: string;
  fetch_method: string;
}

interface FactRow {
  id: string;
  article_id: string;
  statement: string;
  source_count: number;
  used_in_text: boolean;
  note: string | null;
}

interface FactSourceRow {
  fact_id: string;
  source_id: string;
  search_summary_only: boolean;
}

interface ArticleVersionRow {
  id: string;
  article_id: string;
  level: "A2" | "B1" | "B2";
  title: string;
  content: string;
  word_count: number;
  sentences: string[]; // jsonb array of sentence strings
}

interface WordRow {
  version_id: string;
  term: string;
  meaning_ko: string;
  example: string | null;
  pronunciation: string | null;
  sort_order: number;
}

interface QualityCheckRow {
  version_id: string;
  kind: CheckKind;
  score: number | null;
  passed: boolean;
  detail: Record<string, unknown>;
}

interface PipelineRunRow {
  run_date: string;
  stage: string;
  status: "running" | "success" | "failed";
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

/** Splits article body into sentences for the `sentences` jsonb column (a2-data-model.md §2-3 / 0001_schema.sql). */
function splitIntoSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly name = "supabase";
  private client: SupabaseClient;

  constructor(url?: string, serviceRoleKey?: string) {
    const supabaseUrl = url ?? process.env.SUPABASE_URL;
    const supabaseKey = serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "[SupabaseStorageAdapter] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. " +
          "Provision a Supabase project and set both env vars (service_role key, " +
          "not anon) before using this adapter. Use LocalFileStorageAdapter until then.",
      );
    }
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  /** Exposed for tests only — allows injecting a mocked SupabaseClient. */
  static withClient(client: SupabaseClient): SupabaseStorageAdapter {
    const adapter = Object.create(SupabaseStorageAdapter.prototype) as SupabaseStorageAdapter;
    adapter.client = client;
    return adapter;
  }

  async saveEdition(edition: PipelineEdition): Promise<void> {
    assertNeverAutoPublish(edition.status, "edition");
    for (const article of edition.articles) {
      assertNeverAutoPublish(article.status, "article");
    }

    // 1. Upsert the edition row (unique on edition_date).
    const editionRow: EditionRow = {
      id: edition.id,
      edition_date: edition.editionDate,
      status: ALLOWED_EDITION_STATUS,
    };
    const { data: editionData, error: editionError } = await this.client
      .from("editions")
      .upsert(editionRow, { onConflict: "edition_date" })
      .select("id")
      .single();
    if (editionError) {
      throw new Error(`[SupabaseStorageAdapter] editions upsert failed: ${editionError.message}`);
    }
    const editionId = (editionData as { id: string } | null)?.id ?? edition.id;

    // 2. Replace strategy: delete existing articles for this edition (cascade
    //    removes versions/sources/facts/fact_sources/words/quality_checks),
    //    then insert the fresh set from this run. See file header for why
    //    this is delete+insert rather than upsert-by-slug.
    const { error: deleteError } = await this.client
      .from("articles")
      .delete()
      .eq("edition_id", editionId);
    if (deleteError) {
      throw new Error(
        `[SupabaseStorageAdapter] articles delete (pre-replace) failed: ${deleteError.message}`,
      );
    }

    for (const article of edition.articles) {
      await this.insertArticle(editionId, article);
    }
  }

  private async insertArticle(editionId: string, article: PipelineArticle): Promise<void> {
    const articleRow: ArticleRow = {
      id: article.id,
      edition_id: editionId,
      // category_id resolution (categories.slug -> categories.id) is a
      // lookup this adapter doesn't own — categories are seed data. Left
      // null here; wiring a slug->id lookup is a remaining task once a real
      // project exists (see final response "남은 확인 항목").
      category_id: null,
      slug: article.slug,
      event_summary: article.eventSummary,
      rank_in_edition: article.rankInEdition,
      status: ALLOWED_ARTICLE_STATUS,
    };
    const { error: articleError } = await this.client.from("articles").insert(articleRow);
    if (articleError) {
      throw new Error(
        `[SupabaseStorageAdapter] articles insert failed (slug=${article.slug}): ${articleError.message}`,
      );
    }

    // sources
    const sourceRows: SourceRow[] = article.sources.map((s) => ({
      article_id: article.id,
      url: s.url,
      outlet: s.outlet,
      title: s.title,
      fetch_method: s.fetchMethod,
    }));
    const insertedSources = await this.insertSources(article.id, sourceRows);

    // facts + fact_sources (provenance — a2-data-model.md §3 point 3)
    await this.insertFactsWithSources(article.id, article.facts, insertedSources);

    // article_versions + words + quality_checks
    for (const gated of article.versions) {
      await this.insertVersion(article.id, gated);
    }
  }

  private async insertSources(
    articleId: string,
    rows: SourceRow[],
  ): Promise<Array<{ id: string; url: string; outlet: string }>> {
    if (rows.length === 0) return [];
    const { data, error } = await this.client
      .from("sources")
      .insert(rows)
      .select("id, url, outlet");
    if (error) {
      throw new Error(
        `[SupabaseStorageAdapter] sources insert failed (article_id=${articleId}): ${error.message}`,
      );
    }
    return (data as Array<{ id: string; url: string; outlet: string }>) ?? [];
  }

  private async insertFactsWithSources(
    articleId: string,
    facts: ExtractedFact[],
    insertedSources: Array<{ id: string; url: string; outlet: string }>,
  ): Promise<void> {
    if (facts.length === 0) return;

    const factRows: FactRow[] = facts.map((f) => ({
      id: cryptoRandomId(),
      article_id: articleId,
      statement: f.statement,
      source_count: f.sourceCount,
      used_in_text: f.usedInText,
      note: f.note ?? null,
    }));

    const { data: insertedFacts, error: factError } = await this.client
      .from("facts")
      .insert(factRows)
      .select("id, statement");
    if (factError) {
      throw new Error(
        `[SupabaseStorageAdapter] facts insert failed (article_id=${articleId}): ${factError.message}`,
      );
    }

    // fact_sources: link each fact to the sources whose outlet name matches
    // one of the fact's confirmedByOutlets. Outlet name is the only join key
    // available between ExtractedFact (outlet names only) and the sources
    // rows just inserted for this article — a best-effort match, not a
    // strict FK-level guarantee, since ExtractedFact doesn't carry source
    // URLs/ids directly. Sound in practice because outlet names are unique
    // per article's source list (one row per outlet from collect()).
    const sourceIdsByOutlet = new Map<string, string[]>();
    for (const s of insertedSources) {
      sourceIdsByOutlet.set(s.outlet, [...(sourceIdsByOutlet.get(s.outlet) ?? []), s.id]);
    }

    const factSourceRows: FactSourceRow[] = [];
    const insertedFactRows = (insertedFacts as Array<{ id: string; statement: string }>) ?? [];
    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const factId = insertedFactRows[i]?.id ?? factRows[i].id;
      for (const outlet of fact.confirmedByOutlets) {
        const matchingSourceIds = sourceIdsByOutlet.get(outlet) ?? [];
        for (const sourceId of matchingSourceIds) {
          factSourceRows.push({
            fact_id: factId,
            source_id: sourceId,
            search_summary_only: fact.searchSummaryOnly,
          });
        }
      }
    }

    if (factSourceRows.length > 0) {
      const { error: linkError } = await this.client.from("fact_sources").insert(factSourceRows);
      if (linkError) {
        throw new Error(
          `[SupabaseStorageAdapter] fact_sources insert failed (article_id=${articleId}): ${linkError.message}`,
        );
      }
    }
  }

  private async insertVersion(articleId: string, gated: GatedVersion): Promise<void> {
    const versionRow: ArticleVersionRow = {
      id: cryptoRandomId(),
      article_id: articleId,
      level: gated.version.level,
      title: gated.version.title,
      content: gated.version.content,
      word_count: gated.version.wordCount,
      sentences: splitIntoSentences(gated.version.content),
    };
    const { data: insertedVersion, error: versionError } = await this.client
      .from("article_versions")
      .insert(versionRow)
      .select("id")
      .single();
    if (versionError) {
      throw new Error(
        `[SupabaseStorageAdapter] article_versions insert failed (article_id=${articleId}, level=${gated.version.level}): ${versionError.message}`,
      );
    }
    const versionId = (insertedVersion as { id: string } | null)?.id ?? versionRow.id;

    // words (version-scoped — a2-data-model.md §2-2)
    if (gated.version.words.length > 0) {
      const wordRows: WordRow[] = gated.version.words.map((w: WordEntry) => ({
        version_id: versionId,
        term: w.term,
        meaning_ko: w.meaningKo,
        example: w.example ?? null,
        pronunciation: w.pronunciation ?? null,
        sort_order: w.sortOrder,
      }));
      const { error: wordsError } = await this.client.from("words").insert(wordRows);
      if (wordsError) {
        throw new Error(
          `[SupabaseStorageAdapter] words insert failed (version_id=${versionId}): ${wordsError.message}`,
        );
      }
    }

    // quality_checks (one row per QualityCheckResult)
    if (gated.checks.length > 0) {
      const checkRows: QualityCheckRow[] = gated.checks.map((c) => ({
        version_id: versionId,
        kind: c.kind,
        score: c.score,
        passed: c.passed,
        detail: c.detail,
      }));
      const { error: checksError } = await this.client.from("quality_checks").insert(checkRows);
      if (checksError) {
        throw new Error(
          `[SupabaseStorageAdapter] quality_checks insert failed (version_id=${versionId}): ${checksError.message}`,
        );
      }
    }

    // quizzes/quiz_options: explicitly OUT of MVP scope
    // (design-decisions.md §4.5) — never written here.
  }

  async recordPipelineRun(run: PipelineRun): Promise<void> {
    // pipeline_runs is one row PER STAGE (0001_schema.sql), not one row per
    // PipelineRun object — explode run.stages[] into N inserts. Always
    // inserted fresh (append-only audit log), never upserted.
    if (run.stages.length === 0) return;

    const rows: PipelineRunRow[] = run.stages.map((s) => ({
      run_date: run.editionDate,
      stage: s.stage,
      status: s.ok ? "success" : "failed",
      error: s.error ?? null,
      started_at: s.startedAt,
      finished_at: s.finishedAt,
    }));

    const { error } = await this.client.from("pipeline_runs").insert(rows);
    if (error) {
      throw new Error(`[SupabaseStorageAdapter] pipeline_runs insert failed: ${error.message}`);
    }
  }

  async getEdition(editionDate: string): Promise<PipelineEdition | null> {
    const { data: editionData, error: editionError } = await this.client
      .from("editions")
      .select("id, edition_date, status")
      .eq("edition_date", editionDate)
      .maybeSingle();
    if (editionError) {
      throw new Error(`[SupabaseStorageAdapter] editions select failed: ${editionError.message}`);
    }
    const editionRow = editionData as EditionRow | null;
    if (!editionRow) return null;

    const { data: articleData, error: articlesError } = await this.client
      .from("articles")
      .select("id, slug, event_summary, rank_in_edition, status, created_at, category_id")
      .eq("edition_id", editionRow.id);
    if (articlesError) {
      throw new Error(`[SupabaseStorageAdapter] articles select failed: ${articlesError.message}`);
    }

    const articleRows =
      (articleData as Array<{
        id: string;
        slug: string;
        event_summary: string;
        rank_in_edition: number;
        status: ArticleStatus;
        created_at: string;
        category_id: number | null;
      }>) ?? [];

    // NOTE: nested sources/facts/versions/words/quality_checks reassembly is
    // deliberately not implemented in this pass — getEdition() is used today
    // only by verification scripts checking edition/article existence and
    // status, not full-content round-tripping (that path is exercised via
    // LocalFileStorageAdapter in the demo run). Extending this to a full
    // nested select is listed as a remaining item once a real project exists.
    return {
      id: editionRow.id,
      editionDate: editionRow.edition_date,
      status: editionRow.status,
      articles: articleRows.map((a) => ({
        id: a.id,
        slug: a.slug,
        category: "world", // placeholder — see category_id lookup note above
        rankInEdition: a.rank_in_edition,
        status: a.status,
        eventSummary: a.event_summary,
        sources: [],
        facts: [],
        versions: [],
        createdAt: a.created_at,
      })),
    };
  }
}

function cryptoRandomId(): string {
  // Node 18+ has globalThis.crypto.randomUUID(); avoids importing
  // node:crypto in a file that's otherwise dependency-light.
  return globalThis.crypto.randomUUID();
}
