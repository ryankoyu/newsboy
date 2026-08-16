import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BulkApproveResult, EditionListItem, EditionRepository } from "./editionRepository";
import type {
  CategorySlug,
  CefrLevel,
  GatedVersion,
  PipelineArticle,
  PipelineEdition,
  ReviewDecision,
} from "./pipelineTypes";
import {
  assertCanLead,
  assertDecisionAllowed,
  countDecisions,
  verdictForBulkApprove,
} from "./reviewRules";

/**
 * EditionRepository backed by the real database.
 *
 * The console has always read pipeline/output/*.json on the operator's own
 * machine. That directory is gitignored and never deployed, so a deployed
 * console could only show a notice explaining why it was empty — the pipeline
 * wrote to the database, the reader read the database, and the human judgment
 * between them lived in a file on one laptop. This is the missing third side.
 *
 * Uses the SERVICE ROLE key, like publishToSupabase.ts and for the same
 * reason: row-level security admits the anon key only to published rows, and
 * the desk works on `review` and `held` ones. That key belongs on the
 * operator's machine, not in a deployment — see .env.example.
 *
 * What this deliberately does not do is enforce any rule of its own. Every
 * decision goes through reviewRules.ts, shared with the local repository,
 * because two implementations of "can this be approved?" is one implementation
 * plus a future bug.
 */

/**
 * Everything the review screen renders, in one round trip.
 *
 * The console shows gate badges per version, the fact/source provenance
 * block, and each level's body and words, so a partial read would render a
 * screen that looks complete and is not — which is exactly the failure the
 * pipeline's own getEdition() has (it returns articles with no versions and
 * says so in a comment). PostgREST resolves the nesting from the foreign keys
 * declared in 0001_schema.sql.
 */
const EDITION_SELECT = `
  id, edition_date, status, published_at, lead_article_id,
  articles (
    id, slug, event_summary, rank_in_edition, status, created_at, category_id,
    review_decision, exclude_reason, regenerate_note, regenerate_requested_at,
    regeneration_count, regenerated_at,
    sources ( url, outlet, title, fetch_method ),
    facts ( statement, source_count, used_in_text, note ),
    article_versions (
      level, title, content, word_count,
      words ( term, meaning_ko, example, pronunciation, sort_order, is_key, pos ),
      quality_checks ( kind, score, passed, detail )
    )
  )
`;

/** categories.id -> pipeline CategorySlug. Mirrors seedTransform.ts's map, reversed. */
const PIPELINE_CATEGORY_BY_ID: Record<number, CategorySlug> = {
  1: "world",
  2: "korea",
  3: "ai-tech",
  4: "ai-tech",
  5: "business",
  6: "business",
  7: "ai-tech",
  8: "culture-sports",
  9: "culture-sports",
  10: "culture-sports",
};

interface RawVersion {
  level: CefrLevel;
  title: string;
  content: string;
  word_count: number | null;
  words: Array<{
    term: string;
    meaning_ko: string;
    example: string | null;
    pronunciation: string | null;
    sort_order: number;
    is_key: boolean | null;
    pos: string | null;
  }> | null;
  quality_checks: Array<{
    kind: string;
    score: number | null;
    passed: boolean;
    detail: Record<string, unknown> | null;
  }> | null;
}

interface RawArticle {
  id: string;
  slug: string;
  event_summary: string | null;
  rank_in_edition: number | null;
  status: PipelineArticle["status"];
  created_at: string;
  category_id: number | null;
  review_decision: ReviewDecision;
  exclude_reason: string | null;
  regenerate_note: string | null;
  regenerate_requested_at: string | null;
  regeneration_count: number | null;
  regenerated_at: string | null;
  sources: Array<{ url: string; outlet: string; title: string | null; fetch_method: string }> | null;
  facts: Array<{
    statement: string;
    source_count: number;
    used_in_text: boolean;
    note: string | null;
  }> | null;
  article_versions: RawVersion[] | null;
}

interface RawEdition {
  id: string;
  edition_date: string;
  status: PipelineEdition["status"];
  published_at: string | null;
  lead_article_id: string | null;
  articles: RawArticle[] | null;
}

const LEVEL_ORDER: CefrLevel[] = ["A2", "B1", "B2"];

function toGatedVersion(v: RawVersion): GatedVersion {
  const checks = (v.quality_checks ?? []).map((c) => ({
    kind: c.kind as GatedVersion["checks"][number]["kind"],
    level: v.level,
    score: c.score,
    passed: c.passed,
    detail: c.detail ?? {},
  }));
  return {
    version: {
      level: v.level,
      title: v.title,
      content: v.content,
      wordCount: v.word_count ?? 0,
      words: [...(v.words ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((w) => ({
          term: w.term,
          meaningKo: w.meaning_ko,
          example: w.example ?? "",
          pronunciation: w.pronunciation ?? "",
          sortOrder: w.sort_order,
          isKey: w.is_key ?? false,
          pos: w.pos ?? undefined,
        })),
    },
    checks,
    // Derived, not stored: `passed` is simply "no check failed", and deriving
    // it here keeps one source of truth for a value the desk reads as a badge.
    passed: checks.every((c) => c.passed),
    // Not persisted by the pipeline's storage adapter. Shown as "1" rather
    // than invented — the console displays retries only when it knows them.
    rewriteAttempts: 1,
  };
}

function toArticle(a: RawArticle): PipelineArticle {
  return {
    id: a.id,
    slug: a.slug,
    category: (a.category_id && PIPELINE_CATEGORY_BY_ID[a.category_id]) || "world",
    rankInEdition: a.rank_in_edition ?? 0,
    status: a.status,
    eventSummary: a.event_summary ?? "",
    sources: (a.sources ?? []).map((s) => ({
      url: s.url,
      outlet: s.outlet,
      title: s.title ?? "",
      fetchMethod: s.fetch_method,
    })),
    facts: (a.facts ?? []).map((f) => ({
      statement: f.statement,
      // fact_sources carries which outlets confirmed a fact; the console shows
      // the count, which is stored directly. Left empty rather than guessed —
      // an invented outlet list on a provenance panel would be the worst
      // possible place for one.
      confirmedByOutlets: [],
      sourceCount: f.source_count,
      usedInText: f.used_in_text,
      note: f.note ?? undefined,
      searchSummaryOnly: true,
    })),
    versions: [...(a.article_versions ?? [])]
      .sort((x, y) => LEVEL_ORDER.indexOf(x.level) - LEVEL_ORDER.indexOf(y.level))
      .map(toGatedVersion),
    createdAt: a.created_at,
    reviewDecision: a.review_decision,
    excludeReason: a.exclude_reason ?? undefined,
    regenerateNote: a.regenerate_note ?? undefined,
    regenerateRequestedAt: a.regenerate_requested_at ?? undefined,
    regenerationCount: a.regeneration_count ?? undefined,
    regeneratedAt: a.regenerated_at ?? undefined,
  };
}

function toEdition(row: RawEdition): PipelineEdition {
  return {
    id: row.id,
    editionDate: row.edition_date,
    status: row.status,
    publishedAt: row.published_at ?? undefined,
    leadArticleId: row.lead_article_id,
    articles: [...(row.articles ?? [])].sort(
      (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0),
    ).map(toArticle),
  };
}

export class SupabaseEditionRepository implements EditionRepository {
  private client: SupabaseClient;

  constructor(url?: string, serviceRoleKey?: string) {
    const resolvedUrl = url ?? process.env.SUPABASE_URL;
    const resolvedKey = serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!resolvedUrl || !resolvedKey) {
      throw new Error(
        "[SupabaseEditionRepository] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. " +
          "The desk writes review/held rows, which the anon key cannot touch by policy.",
      );
    }
    this.client = createClient(resolvedUrl, resolvedKey);
  }

  async listEditions(): Promise<EditionListItem[]> {
    const { data, error } = await this.client
      .from("editions")
      .select(EDITION_SELECT)
      .order("edition_date", { ascending: false });
    if (error) throw new Error(`[SupabaseEditionRepository] editions: ${error.message}`);
    return ((data ?? []) as unknown as RawEdition[]).map((row) => {
      const edition = toEdition(row);
      return {
        editionDate: edition.editionDate,
        status: edition.status,
        articleCount: edition.articles.length,
        ...countDecisions(edition.articles),
        publishedAt: edition.publishedAt,
      };
    });
  }

  async getEdition(editionDate: string): Promise<PipelineEdition | null> {
    const { data, error } = await this.client
      .from("editions")
      .select(EDITION_SELECT)
      .eq("edition_date", editionDate)
      .maybeSingle();
    if (error) throw new Error(`[SupabaseEditionRepository] edition ${editionDate}: ${error.message}`);
    return data ? toEdition(data as unknown as RawEdition) : null;
  }

  private async requireEdition(editionDate: string): Promise<PipelineEdition> {
    const edition = await this.getEdition(editionDate);
    if (!edition) throw new Error(`Edition not found: ${editionDate}`);
    return edition;
  }

  async setArticleDecision(
    editionDate: string,
    articleId: string,
    decision: ReviewDecision,
    reason?: string | null,
  ): Promise<PipelineEdition> {
    const edition = await this.requireEdition(editionDate);
    const article = edition.articles.find((a) => a.id === articleId);
    if (!article) throw new Error(`Article not found in edition ${editionDate}: ${articleId}`);

    assertDecisionAllowed(article, decision, reason);

    const patch = {
      review_decision: decision,
      exclude_reason: decision === "excluded" ? reason!.trim() : null,
      regenerate_note: decision === "regenerate" ? reason!.trim() : article.regenerateNote ?? null,
      // Clearing only the timestamp leaves the last note readable as history
      // while marking the request itself as no longer outstanding — the
      // pipeline keys off the decision, not the note.
      regenerate_requested_at: decision === "regenerate" ? new Date().toISOString() : null,
    };
    const { error } = await this.client.from("articles").update(patch).eq("id", articleId);
    if (error) throw new Error(`[SupabaseEditionRepository] article update: ${error.message}`);

    return this.requireEdition(editionDate);
  }

  async approveAllPending(editionDate: string): Promise<BulkApproveResult> {
    const edition = await this.requireEdition(editionDate);

    const skipped: BulkApproveResult["skipped"] = [];
    const toApprove: string[] = [];
    for (const article of edition.articles) {
      const verdict = verdictForBulkApprove(article);
      if (verdict.approve) {
        toApprove.push(article.id);
      } else if (verdict.skipReason) {
        skipped.push({
          id: article.id,
          rankInEdition: article.rankInEdition,
          reason: verdict.skipReason,
        });
      }
    }

    if (toApprove.length > 0) {
      // One statement for the batch, as the local repository does one write:
      // a partial bulk approve would leave the desk unsure what it had done.
      const { error } = await this.client
        .from("articles")
        .update({ review_decision: "approved", exclude_reason: null })
        .in("id", toApprove);
      if (error) throw new Error(`[SupabaseEditionRepository] bulk approve: ${error.message}`);
    }
    return { approved: toApprove.length, skipped };
  }

  async setLeadArticle(editionDate: string, articleId: string | null): Promise<void> {
    const edition = await this.requireEdition(editionDate);

    if (articleId !== null) {
      const article = edition.articles.find((a) => a.id === articleId);
      if (!article) throw new Error(`Article not found in edition ${editionDate}: ${articleId}`);
      assertCanLead(article);
    }

    const { error } = await this.client
      .from("editions")
      .update({ lead_article_id: articleId })
      .eq("edition_date", editionDate);
    if (error) throw new Error(`[SupabaseEditionRepository] lead article: ${error.message}`);
  }

  async setEditionStatus(
    editionDate: string,
    status: PipelineEdition["status"],
    publishedAt?: string | null,
  ): Promise<PipelineEdition> {
    await this.requireEdition(editionDate);
    const { error } = await this.client
      .from("editions")
      .update({
        status,
        published_at: status === "published" ? publishedAt ?? new Date().toISOString() : null,
      })
      .eq("edition_date", editionDate);
    if (error) throw new Error(`[SupabaseEditionRepository] edition status: ${error.message}`);
    return this.requireEdition(editionDate);
  }
}
