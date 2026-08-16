/**
 * SupabaseStorageAdapter — writes pipeline output into the real Supabase
 * schema (supabase/migrations/0001_schema.sql, plus 0003/0004 for the
 * 'held' status and words.pos/is_key, and 0005 for pipeline_checkpoints).
 * It has run against the live
 * project: GitHub Actions run 31493703937 (2026-08-11) stored an edition and
 * one article with STORAGE=supabase. The unit test alongside it
 * (storage/supabase.test.ts) mocks the query builder to assert the exact
 * table/column mapping — there is still no network integration test, so a
 * schema change lands here silently until the next real run.
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
 *   0. A date whose edition is already `published` is refused outright —
 *      "replace" would delete human-approved articles. Draft editions are
 *      fair game to regenerate.
 *   1. `editions` — upsert on edition_date, with the payload deliberately
 *      OMITTING `id`. Every run mints a fresh randomUUID() for the in-memory
 *      PipelineEdition (run.ts), and sending it would make ON CONFLICT
 *      (edition_date) DO UPDATE rewrite the existing row's primary key.
 *      articles.edition_id has no ON UPDATE CASCADE (0001_schema.sql), so the
 *      second run for a date used to die on an FK violation — and the
 *      "delete the old articles first" step below couldn't help, because it
 *      runs after the upsert and would have been looking for the new id.
 *      Leaving `id` out means the DB keeps the row it already has on re-run
 *      and fills it from gen_random_uuid() on first insert; the returned id
 *      is what every child row is written against.
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
  CategorySlug,
  CheckKind,
  ExtractedFact,
  GatedVersion,
  GlossEntry,
  PipelineArticle,
  PipelineCheckpoint,
  PipelineEdition,
  PipelineRun,
  WordEntry,
} from "../types.js";
import { CHECKPOINT_MAX_AGE_HOURS } from "./adapter.js";
import type { StorageAdapter } from "./adapter.js";

/**
 * Article statuses this adapter is ever allowed to write. Enforced defensively
 * even though run.ts already narrows the type at the call site — the pipeline
 * must NEVER auto-publish (a1 §2: "사람 승인 없이는 절대 발행되지 않는다";
 * task constraint: "'approved'/'published' 쓰는 코드 금지").
 *
 * 'held' is allowed alongside 'review' because it is the same destination —
 * a human looks at it in web/ admin — just flagged with why it got there
 * (post-rewrite two-source failure, run.ts articleStatusForGatedVersions).
 * Rejecting it made the guard fire on a status the pipeline itself produces,
 * and since saveEdition() checks every article up front, one 'held' article
 * threw away the entire run's output before a single row was written.
 * 'approved'/'published' stay out — blocking those is the whole point.
 */
const ALLOWED_ARTICLE_STATUSES: readonly ArticleStatus[] = ["review", "held"];
const ALLOWED_EDITION_STATUS = "draft";

function assertNeverAutoPublish(status: string, kind: "article" | "edition"): void {
  const allowed: readonly string[] =
    kind === "article" ? ALLOWED_ARTICLE_STATUSES : [ALLOWED_EDITION_STATUS];
  if (!allowed.includes(status)) {
    throw new Error(
      `[SupabaseStorageAdapter] refusing to write ${kind} status='${status}' — ` +
        `this adapter may only write status=${allowed.map((s) => `'${s}'`).join("|")}. ` +
        `Approval/publish is a human action performed in web/ admin, never by ` +
        `the pipeline.`,
    );
  }
}

/**
 * pipeline CategorySlug -> categories.slug (supabase/migrations/0004 seed).
 *
 * The pipeline curates into 5 buckets while categories carries the web's
 * 10-slug list, so the compound buckets collapse onto their primary member.
 * Kept identical to web/src/lib/admin/seedTransform.ts's CATEGORY_SLUG_MAP —
 * the seed importer and this adapter write into the same column, and two
 * different mappings would give the same story two different categories
 * depending on which path stored it.
 */
const CATEGORY_SLUG_MAP: Record<CategorySlug, string> = {
  world: "world",
  korea: "korea",
  "ai-tech": "ai",
  business: "business",
  "culture-sports": "culture",
};

/** Reverse of CATEGORY_SLUG_MAP, for reading rows back in getEdition(). */
const PIPELINE_CATEGORY_BY_DB_SLUG: Record<string, CategorySlug> = Object.fromEntries(
  Object.entries(CATEGORY_SLUG_MAP).map(([pipelineSlug, dbSlug]) => [dbSlug, pipelineSlug]),
) as Record<string, CategorySlug>;

// ---------------------------------------------------------------------------
// Row shapes (mirrors supabase/migrations/0001_schema.sql column names)
// ---------------------------------------------------------------------------

interface EditionRow {
  id: string;
  edition_date: string;
  status: "draft" | "published";
}

/** Upsert payload — `id` is intentionally absent, see the file header. */
interface EditionUpsertRow {
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
  is_key: boolean;
  pos: string | null;
}

/**
 * glosses (0006) — the dictionary, keyed by term and shared by every edition.
 *
 * No version_id, unlike WordRow: a curated word belongs to one level of one
 * article, a gloss belongs to the language.
 */
interface GlossRow {
  term: string;
  meaning_ko: string;
  pos: string | null;
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

/**
 * pipeline_checkpoints (supabase/migrations/0005). One row per edition date;
 * `payload` is the whole PipelineCheckpoint, and edition_date/run_id/
 * updated_at are the same values lifted out so the row is legible in the
 * Supabase dashboard and expiry can be a plain indexed comparison.
 */
interface PipelineCheckpointRow {
  edition_date: string;
  run_id: string;
  payload: PipelineCheckpoint;
  updated_at: string;
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

    // 0. Refuse to replace an edition a human already published.
    //
    //    Until the id-overwrite bug below was fixed, a same-day re-run died
    //    on an FK violation before it could touch anything — the crash was
    //    accidentally acting as a guard. With re-runs working, the "replace"
    //    strategy would happily delete a published edition's articles and
    //    swap in fresh unreviewed drafts. Undoing an approval is a human
    //    action (a1 §2); the pipeline stops here and says so instead.
    const { data: existingData, error: existingError } = await this.client
      .from("editions")
      .select("id, status")
      .eq("edition_date", edition.editionDate)
      .maybeSingle();
    if (existingError) {
      throw new Error(
        `[SupabaseStorageAdapter] editions pre-check select failed: ${existingError.message}`,
      );
    }
    const existing = existingData as { id: string; status?: string } | null;
    if (existing?.status === "published") {
      throw new Error(
        `[SupabaseStorageAdapter] refusing to overwrite published edition ` +
          `${edition.editionDate} — its articles were approved by a human. ` +
          `Unpublish it in web/ admin first if this edition really should be regenerated.`,
      );
    }

    // 1. Upsert the edition row (unique on edition_date). No `id` in the
    //    payload — sending this run's fresh UUID would rewrite an existing
    //    edition's primary key and break articles.edition_id (no ON UPDATE
    //    CASCADE). See the file header.
    const editionRow: EditionUpsertRow = {
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

    // Categories are seed data (supabase/migrations/0004) — read the whole
    // table once per edition rather than per article; it is 10 rows.
    const categoryIdBySlug = await this.loadCategoryIds();
    if (categoryIdBySlug.size === 0) {
      console.warn(
        "[SupabaseStorageAdapter] categories table is empty — articles will be " +
          "stored with category_id=null. Apply " +
          "supabase/migrations/0004_words_pos_and_categories_seed.sql.",
      );
    }

    for (const article of edition.articles) {
      await this.insertArticle(editionId, article, categoryIdBySlug);
    }
  }

  /**
   * categories.slug -> categories.id. Empty map (not a throw) when the table
   * has no rows: an unseeded categories table costs us the category tag, and
   * losing the tag is not worth discarding a full run's rewrite spend at the
   * last stage. A real query error still throws — that is a broken database,
   * not missing seed data.
   */
  private async loadCategoryIds(): Promise<Map<string, number>> {
    const { data, error } = await this.client.from("categories").select("id, slug");
    if (error) {
      throw new Error(`[SupabaseStorageAdapter] categories select failed: ${error.message}`);
    }
    const rows = (data as Array<{ id: number; slug: string }> | null) ?? [];
    return new Map(rows.map((r) => [r.slug, r.id]));
  }

  private async insertArticle(
    editionId: string,
    article: PipelineArticle,
    categoryIdBySlug: Map<string, number>,
  ): Promise<void> {
    const categorySlug = CATEGORY_SLUG_MAP[article.category];
    const categoryId = categoryIdBySlug.get(categorySlug) ?? null;
    if (categoryId === null && categoryIdBySlug.size > 0) {
      // Seeded table that doesn't know this slug means the two lists drifted
      // apart — worth saying out loud, but not worth failing the store stage.
      console.warn(
        `[SupabaseStorageAdapter] no categories row for slug='${categorySlug}' ` +
          `(pipeline category '${article.category}') — storing category_id=null.`,
      );
    }

    const articleRow: ArticleRow = {
      id: article.id,
      edition_id: editionId,
      category_id: categoryId,
      slug: article.slug,
      event_summary: article.eventSummary,
      rank_in_edition: article.rankInEdition,
      // 'review' or 'held' — already vetted by assertNeverAutoPublish() over
      // the whole edition before any row was written. Passing it through
      // rather than pinning to 'review' is what keeps the 2-source failure
      // visible to the human reviewer instead of blending into the pile.
      status: article.status,
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

    // fact_sources' primary key is (fact_id, source_id), and a fact's
    // confirmedByOutlets can legitimately name the same outlet twice — the
    // extractor de-dupes it too when counting sources
    // (extract.ts: `new Set(f.confirmedByOutlets).size`). Emitting the pair
    // twice used to fail the insert here, at the very last stage, after the
    // run had already paid for every rewrite. `seen` keeps the first row for
    // a pair and drops repeats.
    const factSourceRows: FactSourceRow[] = [];
    const seen = new Set<string>();
    const insertedFactRows = (insertedFacts as Array<{ id: string; statement: string }>) ?? [];
    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];
      const factId = insertedFactRows[i]?.id ?? factRows[i].id;
      for (const outlet of fact.confirmedByOutlets) {
        const matchingSourceIds = sourceIdsByOutlet.get(outlet) ?? [];
        for (const sourceId of matchingSourceIds) {
          // The separator is written as an escape, never as a literal NUL
          // typed into the source. A literal one makes grep and ripgrep
          // classify this whole file as binary and silently return nothing
          // for every search in it — a 750-line adapter that appears not to
          // exist. The escape compiles to the same character (chosen because
          // no id can contain it) and keeps the file searchable.
          const pair = `${factId}\u0000${sourceId}`;
          if (seen.has(pair)) continue;
          seen.add(pair);
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
        // The rewrite prompt requires both (llm/prompts.ts wordEntrySchema),
        // so a fresh run always carries them; the ?? branches only cover
        // fixtures and older drafts. Dropping them here was throwing away
        // data we had already paid the model to produce.
        is_key: w.isKey ?? false,
        pos: w.pos ?? null,
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

    // categories.id -> pipeline CategorySlug. Rows written by the seed
    // importer can carry a web-only slug ('tech', 'finance', …) that has no
    // pipeline bucket; those fall back to 'world' rather than guessing which
    // of the 5 they belong to (design-decisions.md 규칙 1 — don't invent).
    const categoryIds = await this.loadCategoryIds();
    const dbSlugById = new Map<number, string>(
      [...categoryIds].map(([slug, id]) => [id, slug]),
    );
    const categoryFor = (categoryId: number | null): CategorySlug => {
      if (categoryId === null) return "world";
      const dbSlug = dbSlugById.get(categoryId);
      return (dbSlug && PIPELINE_CATEGORY_BY_DB_SLUG[dbSlug]) || "world";
    };

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
        category: categoryFor(a.category_id),
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

  // -------------------------------------------------------------------------
  // Resume checkpoints — pipeline_checkpoints (supabase/migrations/0005)
  //
  // These used to be local JSON files even in Supabase mode. That made
  // a1 §2's promise ("어느 단계에서 죽어도 마지막 성공 지점부터 재개한다")
  // true everywhere except where the pipeline actually runs: a GitHub Actions
  // job gets a fresh runner, so a re-dispatched job found no file and paid
  // for every Opus rewrite a second time. Runs on this adapter are the
  // scheduled ones, so its checkpoint has to outlive the runner.
  //
  // Errors are thrown rather than swallowed. run.ts wraps all three calls and
  // degrades to a full re-run, which is the right cost for a checkpoint that
  // could not be reached — but silently returning "no checkpoint" from a
  // broken connection would hide the reason from the log.
  // -------------------------------------------------------------------------

  async saveCheckpoint(checkpoint: PipelineCheckpoint): Promise<void> {
    const row: PipelineCheckpointRow = {
      edition_date: checkpoint.editionDate,
      run_id: checkpoint.runId,
      payload: checkpoint,
      updated_at: checkpoint.updatedAt,
    };
    const { error } = await this.client
      .from("pipeline_checkpoints")
      .upsert(row, { onConflict: "edition_date" });
    if (error) {
      throw new Error(
        `[SupabaseStorageAdapter] pipeline_checkpoints upsert failed: ${error.message}`,
      );
    }
  }

  async loadCheckpoint(editionDate: string): Promise<PipelineCheckpoint | null> {
    // Sweep expired rows first. run.ts refuses to resume from anything older
    // than CHECKPOINT_MAX_AGE_HOURS, so those rows can never be read again —
    // and a payload carrying a day's collected article text is measured in
    // megabytes, which on a free-tier project would add up to real storage
    // for data nobody can use. Once per run, on the one call that already
    // happens exactly once.
    const expiredBefore = new Date(
      Date.now() - CHECKPOINT_MAX_AGE_HOURS * 3600_000,
    ).toISOString();
    const { error: sweepError } = await this.client
      .from("pipeline_checkpoints")
      .delete()
      .lt("updated_at", expiredBefore);
    if (sweepError) {
      // Housekeeping must never cost us the checkpoint we came here to read.
      console.warn(
        `[SupabaseStorageAdapter] expired checkpoint sweep failed (continuing): ${sweepError.message}`,
      );
    }

    const { data, error } = await this.client
      .from("pipeline_checkpoints")
      .select("payload")
      .eq("edition_date", editionDate)
      .maybeSingle();
    if (error) {
      throw new Error(
        `[SupabaseStorageAdapter] pipeline_checkpoints select failed: ${error.message}`,
      );
    }
    const row = data as Pick<PipelineCheckpointRow, "payload"> | null;
    return row?.payload ?? null;
  }

  async clearCheckpoint(editionDate: string): Promise<void> {
    const { error } = await this.client
      .from("pipeline_checkpoints")
      .delete()
      .eq("edition_date", editionDate);
    if (error) {
      throw new Error(
        `[SupabaseStorageAdapter] pipeline_checkpoints delete failed: ${error.message}`,
      );
    }
  }

  /**
   * Dictionary glosses (0006_glosses.sql) — insert-if-absent, keyed by term.
   *
   * `ignoreDuplicates: true` is the whole behaviour: a term another edition
   * already glossed keeps the gloss a reader may have seen and saved to their
   * vocabulary list. It also makes the write safe against a concurrent run
   * that glossed the same word a second earlier, which a read-then-insert
   * would turn into a unique-violation.
   *
   * Chunked because an edition can introduce well over a thousand terms and
   * one insert of that size is a request large enough to be worth not finding
   * the limit of experimentally.
   */
  async saveGlosses(entries: readonly GlossEntry[]): Promise<void> {
    const CHUNK = 500;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const rows: GlossRow[] = entries.slice(i, i + CHUNK).map((e) => ({
        term: e.term,
        meaning_ko: e.meaningKo,
        pos: e.pos ?? null,
      }));
      if (rows.length === 0) continue;
      const { error } = await this.client
        .from("glosses")
        .upsert(rows, { onConflict: "term", ignoreDuplicates: true });
      if (error) {
        throw new Error(`[SupabaseStorageAdapter] glosses upsert failed: ${error.message}`);
      }
    }
  }

  /**
   * Terms the dictionary already covers.
   *
   * Paged rather than one select: Supabase caps a response at 1,000 rows by
   * default, and a truncated list here does not fail — it silently re-buys
   * glosses the dictionary already had, which is exactly the cost this table
   * exists to avoid. The loop is the only thing keeping the daily bill falling.
   */
  async loadKnownGlossTerms(): Promise<Set<string>> {
    const PAGE = 1000;
    const terms = new Set<string>();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.client
        .from("glosses")
        .select("term")
        .order("term")
        .range(from, from + PAGE - 1);
      if (error) {
        throw new Error(`[SupabaseStorageAdapter] glosses select failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<Pick<GlossRow, "term">>;
      for (const row of rows) terms.add(row.term);
      if (rows.length < PAGE) return terms;
    }
  }
}

function cryptoRandomId(): string {
  // Node 18+ has globalThis.crypto.randomUUID(); avoids importing
  // node:crypto in a file that's otherwise dependency-light.
  return globalThis.crypto.randomUUID();
}
