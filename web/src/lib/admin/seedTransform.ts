/**
 * Pure transform: PipelineEdition (approved articles only) -> web seed table
 * rows (web/src/lib/data/seed/*.json shape). This is the "승인 → 웹 반영"
 * conversion (production-readiness.md §2), the spiritual successor to
 * pipeline/src/scripts/build-seed-2026-07-13.ts — but reading from the
 * CURRENT editions/<date>.json shape (PipelineArticle/GatedVersion/
 * ExtractedFact), which differs from that script's older
 * pipeline/output/articles/event-N.json input shape (no sourceUrls on
 * facts, category lives directly on the article, content is one string
 * with paragraph breaks instead of a pre-split sentences array). Kept as a
 * pure function (no fs) so it's unit-testable without touching disk —
 * publishEdition.ts does the actual file I/O.
 *
 * ID scheme (kept identical to the precedent script so downstream code that
 * assumes this shape keeps working):
 *   edition:   edition-<date>
 *   article:   article-<date>-<rank>
 *   version:   version-<date>-<rank>-<level lowercased>
 *   word:      word-<date>-<rank>-<level lowercased>-<n (1-based)>
 *   fact:      fact-<date>-<rank>-<n (1-based)>
 *   source:    source-<date>-<rank>-<n (1-based, sources[] order)>
 */
import type {
  PipelineArticle,
  PipelineEdition,
  CategorySlug as PipelineCategorySlug,
} from "./pipelineTypes";

/**
 * pipeline's 5-way CategorySlug -> web's categories.json slug (documented
 * identically in build-seed-2026-07-13.ts's header, generalized here to a
 * direct mapping since editions/<date>.json carries `category` on every
 * article — the old event-N.json format didn't, which is why that script
 * needed a per-rank guess table instead).
 */
const CATEGORY_SLUG_MAP: Record<PipelineCategorySlug, string> = {
  world: "world",
  korea: "korea",
  "ai-tech": "ai",
  business: "business",
  "culture-sports": "culture",
};

// Moved to lib/sentences.ts — the Supabase provider needs the same split,
// and two copies would break saved sentences, which are keyed on index.
export { splitSentences } from "@/lib/sentences";
import { splitSentences } from "@/lib/sentences";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface SeedRow {
  [key: string]: unknown;
}

export interface SeedBundle {
  edition: SeedRow;
  articles: SeedRow[];
  article_versions: SeedRow[];
  words: SeedRow[];
  facts: SeedRow[];
  sources: SeedRow[];
  fact_sources: SeedRow[];
  /** Rows skipped and why — surfaced to the operator, never silently dropped. */
  warnings: string[];
}

export function buildSeedBundle(
  edition: PipelineEdition,
  categoryIdBySlug: Record<string, number>,
  publishedAtIso: string
): SeedBundle {
  const date = edition.editionDate;
  const editionId = `edition-${date}`;
  const warnings: string[] = [];

  const approvedByPipelineRank: PipelineArticle[] = edition.articles
    .filter((a) => a.reviewDecision === "approved")
    .sort((a, b) => a.rankInEdition - b.rankInEdition);

  // The desk can put any approved article on the front page. Applied as an
  // ordering, not a renumbering: article ids stay derived from the PIPELINE
  // rank so re-publishing after a lead change replaces the same rows rather
  // than orphaning them. A lead pointing at an article that was later
  // excluded simply does not apply, and the pipeline order stands.
  const leadId = edition.leadArticleId ?? null;
  const lead = leadId ? approvedByPipelineRank.find((a) => a.id === leadId) : undefined;
  if (leadId && !lead) {
    warnings.push(
      `1면으로 지정된 기사(${leadId})가 승인 목록에 없어 무시했습니다 — 파이프라인 순서를 사용합니다.`
    );
  }
  const approved: PipelineArticle[] = lead
    ? [lead, ...approvedByPipelineRank.filter((a) => a.id !== lead.id)]
    : approvedByPipelineRank;

  const articles: SeedRow[] = [];
  const articleVersions: SeedRow[] = [];
  const words: SeedRow[] = [];
  const facts: SeedRow[] = [];
  const sources: SeedRow[] = [];
  const factSources: SeedRow[] = [];

  for (const [displayIndex, article] of approved.entries()) {
    // Identity comes from the pipeline rank; presentation from the desk order.
    const rank = article.rankInEdition;
    const displayRank = displayIndex + 1;
    const articleId = `article-${date}-${rank}`;
    const categorySlug = CATEGORY_SLUG_MAP[article.category];
    const categoryId = categorySlug ? categoryIdBySlug[categorySlug] : undefined;
    if (categoryId === undefined) {
      warnings.push(
        `article rank ${rank}: no category id for pipeline category "${article.category}" (mapped slug "${categorySlug}") — category_id left null`
      );
    }

    // Slug from the A2 title, same convention as build-seed-2026-07-13.ts.
    const a2 = article.versions.find((v) => v.version.level === "A2");
    const slugBase = (a2?.version.title ?? article.slug)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/'/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const slug = `${slugBase}-${rank}`;

    articles.push({
      id: articleId,
      edition_id: editionId,
      category_id: categoryId ?? null,
      slug,
      event_summary: article.eventSummary,
      rank_in_edition: displayRank,
      status: "published",
      published_at: publishedAtIso,
      created_at: article.createdAt,
      updated_at: publishedAtIso,
    });

    // --- sources ---
    article.sources.forEach((s, idx) => {
      sources.push({
        id: `source-${date}-${rank}-${idx + 1}`,
        article_id: articleId,
        url: s.url,
        outlet: s.outlet,
        title: s.title,
        // No per-source fetch timestamp exists in pipeline output; using the
        // article's own createdAt as the closest honest proxy (documented,
        // not invented data).
        fetched_at: article.createdAt,
        fetch_method: s.fetchMethod,
        created_at: publishedAtIso,
      });
    });

    // --- facts + fact_sources (linked by outlet name — see file header) ---
    article.facts.forEach((f, idx) => {
      const factId = `fact-${date}-${rank}-${idx + 1}`;
      facts.push({
        id: factId,
        article_id: articleId,
        statement: f.statement,
        source_count: f.sourceCount,
        used_in_text: f.usedInText,
        note: f.note ?? null,
        created_at: publishedAtIso,
      });

      const matchedSourceIds = article.sources
        .map((s, idx2) => ({ s, id: `source-${date}-${rank}-${idx2 + 1}` }))
        .filter(({ s }) => f.confirmedByOutlets.includes(s.outlet))
        .map(({ id }) => id);

      if (matchedSourceIds.length === 0 && f.confirmedByOutlets.length > 0) {
        warnings.push(
          `article rank ${rank}, fact ${idx + 1}: no sources[] row matched confirmedByOutlets ${JSON.stringify(f.confirmedByOutlets)} — fact_sources rows skipped for this fact`
        );
      }
      for (const sourceId of matchedSourceIds) {
        factSources.push({
          fact_id: factId,
          source_id: sourceId,
          search_summary_only: f.searchSummaryOnly,
        });
      }
    });

    // --- versions + words ---
    for (const gv of article.versions) {
      const level = gv.version.level;
      const versionId = `version-${date}-${rank}-${level.toLowerCase()}`;
      const sentences = splitSentences(gv.version.content);
      const content = sentences.join(" ");

      articleVersions.push({
        id: versionId,
        article_id: articleId,
        level,
        title: gv.version.title,
        content,
        sentences,
        word_count: countWords(content),
        created_at: publishedAtIso,
      });

      gv.version.words.forEach((w, idx) => {
        const wordRow: SeedRow = {
          id: `word-${date}-${rank}-${level.toLowerCase()}-${idx + 1}`,
          version_id: versionId,
          term: w.term,
          meaning_ko: w.meaningKo,
          example: w.example ?? null,
          pronunciation: w.pronunciation ?? null,
          sort_order: w.sortOrder ?? idx + 1,
        };
        if (w.isKey === true) wordRow.isKey = true;
        if (w.pos) wordRow.pos = w.pos;
        words.push(wordRow);
      });
    }
  }

  return {
    edition: {
      id: editionId,
      edition_date: date,
      status: "published",
      published_at: publishedAtIso,
      created_at: publishedAtIso,
    },
    articles,
    article_versions: articleVersions,
    words,
    facts,
    sources,
    fact_sources: factSources,
    warnings,
  };
}
