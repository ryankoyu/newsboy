/**
 * Rebuilds web/src/lib/data/seed/*.json from pipeline/output/articles/event-1..10.json
 * for the 2026-07-13 edition.
 *
 * This is the second run of this transform (first run produced the seed files
 * that already exist in web/src/lib/data/seed/). The writer team has since
 * revised event-4.json (rank4 A2 rewrite) and added an `isKey` field to word
 * entries across all events, so this script re-derives all 8 seed tables from
 * scratch and overwrites them.
 *
 * ID / slug / mapping conventions below were reverse-engineered from the
 * existing (first-run) seed output and preserved exactly so unrelated rows
 * don't drift:
 *  - article id:        article-2026-07-13-{rank}
 *  - slug:               slugify(A2 title) + "-" + rank
 *  - category mapping:   pipeline's 5-way CategorySlug -> web's categories.json
 *                        slug. world->world, korea->korea, ai-tech->ai,
 *                        business->business, culture-sports->culture.
 *                        (ai-tech/culture-sports never resolved to "tech"/
 *                        "sports"/"business" for this edition's actual ranks;
 *                        this is a judgment call made in the first run, kept
 *                        as-is since no rank's topic changed category.)
 *  - version id:         version-2026-07-13-{rank}-{level lowercased}
 *  - word id:             word-2026-07-13-{rank}-{level lowercased}-{n (1-based)}
 *  - fact id:             fact-2026-07-13-{rank}-{n (1-based)}
 *  - source id:           source-2026-07-13-{rank}-{n (1-based, sources[] order)}
 *  - fact_sources:        one row per (fact, source) pair where source.url is
 *                        in fact.sourceUrls, in source-array order.
 *                        search_summary_only is always false in the existing
 *                        seed (unused placeholder) -- preserved as-is.
 *  - sources.fetch_method: source.fetched ? "full_text" : "search_summary"
 *  - word_count:          content.split(/\s+/).length (whitespace split),
 *                        verified against existing seed's word_count values.
 *  - content:            version.sentences.join(" ")
 *
 * Output: overwrites all 8 files in web/src/lib/data/seed/.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARTICLES_DIR = join(__dirname, "../../output/articles");
const SEED_DIR = join(__dirname, "../../../web/src/lib/data/seed");
const EDITION_DATE = "2026-07-13";
const CREATED_AT = "2026-07-13T00:00:00.000Z";

interface EventWordEntry {
  word: string;
  meaning_ko: string;
  example: string;
  ipa: string;
  isKey?: boolean;
}

interface EventVersion {
  title: string;
  sentences: string[];
  words: EventWordEntry[];
}

interface EventFact {
  text: string;
  sourceUrls: string[];
  usedInText: boolean;
}

interface EventSource {
  outlet: string;
  title: string;
  url: string;
  fetched: boolean;
}

interface EventFile {
  rank: number;
  category: string;
  eventSummary: string;
  facts: EventFact[];
  sources: EventSource[];
  versions: Record<"A2" | "B1" | "B2", EventVersion>;
  notes?: string;
}

const CATEGORY_SLUGS = [
  "world",
  "korea",
  "ai",
  "tech",
  "business",
  "finance",
  "science",
  "sports",
  "culture",
  "lifestyle",
] as const;

// Preserved from the first-run seed (see header comment) -- keyed by rank,
// not by the pipeline category string alone, since ai-tech/culture-sports
// are ambiguous without knowing the article's actual topic.
const CATEGORY_SLUG_BY_RANK: Record<number, (typeof CATEGORY_SLUGS)[number]> = {
  1: "world",
  2: "world",
  3: "world",
  4: "korea",
  5: "korea",
  6: "ai",
  7: "ai",
  8: "culture",
  9: "world",
  10: "world",
};

function loadCategoryIds(): Record<string, number> {
  const categories = JSON.parse(
    readFileSync(join(SEED_DIR, "categories.json"), "utf-8"),
  ) as Array<{ id: number; slug: string }>;
  const bySlug: Record<string, number> = {};
  for (const c of categories) bySlug[c.slug] = c.id;
  return bySlug;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const LEVELS: Array<"A2" | "B1" | "B2"> = ["A2", "B1", "B2"];

function main(): void {
  const categoryIds = loadCategoryIds();

  const articles: Array<Record<string, unknown>> = [];
  const articleVersions: Array<Record<string, unknown>> = [];
  const words: Array<Record<string, unknown>> = [];
  const facts: Array<Record<string, unknown>> = [];
  const sources: Array<Record<string, unknown>> = [];
  const factSources: Array<Record<string, unknown>> = [];

  const slugChanges: Array<{ rank: number; oldSlug: string; newSlug: string }> = [];
  const unmatchedFactSourceUrls: Array<{ rank: number; factIndex: number; url: string }> = [];

  // Load existing seed articles.json to detect slug changes for the report.
  const existingArticles = JSON.parse(
    readFileSync(join(SEED_DIR, "articles.json"), "utf-8"),
  ) as Array<{ rank_in_edition: number; slug: string }>;
  const existingSlugByRank = new Map(existingArticles.map((a) => [a.rank_in_edition, a.slug]));

  for (let rank = 1; rank <= 10; rank++) {
    const event = JSON.parse(
      readFileSync(join(ARTICLES_DIR, `event-${rank}.json`), "utf-8"),
    ) as EventFile;

    const articleId = `article-2026-07-13-${rank}`;
    const a2Title = event.versions.A2.title;
    const slug = `${slugify(a2Title)}-${rank}`;

    const prevSlug = existingSlugByRank.get(rank);
    if (prevSlug && prevSlug !== slug) {
      slugChanges.push({ rank, oldSlug: prevSlug, newSlug: slug });
    }

    const categorySlug = CATEGORY_SLUG_BY_RANK[rank];
    const categoryId = categoryIds[categorySlug];
    if (categoryId === undefined) {
      throw new Error(`No category id found for slug "${categorySlug}" (rank ${rank})`);
    }

    articles.push({
      id: articleId,
      edition_id: `edition-${EDITION_DATE}`,
      category_id: categoryId,
      slug,
      event_summary: event.eventSummary,
      rank_in_edition: rank,
      status: "published",
      published_at: CREATED_AT,
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    });

    // --- sources ---
    const sourceIdByUrl = new Map<string, string>();
    event.sources.forEach((s, idx) => {
      const sourceId = `source-2026-07-13-${rank}-${idx + 1}`;
      sourceIdByUrl.set(s.url, sourceId);
      sources.push({
        id: sourceId,
        article_id: articleId,
        url: s.url,
        outlet: s.outlet,
        title: s.title,
        fetched_at: CREATED_AT,
        fetch_method: s.fetched ? "full_text" : "search_summary",
        created_at: CREATED_AT,
      });
    });

    // --- facts + fact_sources ---
    event.facts.forEach((f, idx) => {
      const factId = `fact-2026-07-13-${rank}-${idx + 1}`;

      const matchedSourceIds: string[] = [];
      for (const url of f.sourceUrls) {
        const sourceId = sourceIdByUrl.get(url);
        if (!sourceId) {
          // Pre-existing data mismatch (event JSON's fact.sourceUrls citing a
          // URL not present in that event's sources[] array) -- confirmed to
          // already exist in the first-run seed (e.g. rank 5, fact 2's CNBC
          // 07-02 URL), which silently skipped the unmatched URL rather than
          // inventing a source row. Preserved here as skip + warn, not a fix.
          unmatchedFactSourceUrls.push({ rank, factIndex: idx + 1, url });
          continue;
        }
        matchedSourceIds.push(sourceId);
      }

      // source_count reflects only sourceUrls that resolved to a real
      // sources[] row (matches first-run seed behavior, verified against
      // rank 5 facts 2/4/5 which each have one unmatched URL).
      facts.push({
        id: factId,
        article_id: articleId,
        statement: f.text,
        source_count: matchedSourceIds.length,
        used_in_text: f.usedInText,
        note: null,
        created_at: CREATED_AT,
      });

      for (const sourceId of matchedSourceIds) {
        factSources.push({
          fact_id: factId,
          source_id: sourceId,
          search_summary_only: false,
        });
      }
    });

    // --- versions + words ---
    for (const level of LEVELS) {
      const version = event.versions[level];
      const versionId = `version-2026-07-13-${rank}-${level.toLowerCase()}`;
      const content = version.sentences.join(" ");
      const wordCount = content.split(/\s+/).filter(Boolean).length;

      articleVersions.push({
        id: versionId,
        article_id: articleId,
        level,
        title: version.title,
        content,
        sentences: version.sentences,
        word_count: wordCount,
        created_at: CREATED_AT,
      });

      version.words.forEach((w, idx) => {
        const wordEntry: Record<string, unknown> = {
          id: `word-2026-07-13-${rank}-${level.toLowerCase()}-${idx + 1}`,
          version_id: versionId,
          term: w.word,
          meaning_ko: w.meaning_ko,
          example: w.example ?? null,
          pronunciation: w.ipa ?? null,
          sort_order: idx + 1,
        };
        if (w.isKey === true) {
          wordEntry.isKey = true;
        }
        words.push(wordEntry);
      });
    }
  }

  writeFileSync(join(SEED_DIR, "articles.json"), JSON.stringify(articles, null, 2) + "\n", "utf-8");
  writeFileSync(
    join(SEED_DIR, "article_versions.json"),
    JSON.stringify(articleVersions, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(join(SEED_DIR, "words.json"), JSON.stringify(words, null, 2) + "\n", "utf-8");
  writeFileSync(join(SEED_DIR, "facts.json"), JSON.stringify(facts, null, 2) + "\n", "utf-8");
  writeFileSync(join(SEED_DIR, "sources.json"), JSON.stringify(sources, null, 2) + "\n", "utf-8");
  writeFileSync(
    join(SEED_DIR, "fact_sources.json"),
    JSON.stringify(factSources, null, 2) + "\n",
    "utf-8",
  );
  // categories.json and editions.json are static reference data, unchanged.

  console.log(`[build-seed] wrote ${articles.length} articles, ${articleVersions.length} versions, ${words.length} words, ${facts.length} facts, ${sources.length} sources, ${factSources.length} fact_sources`);
  if (slugChanges.length > 0) {
    console.log(`[build-seed] SLUG CHANGES DETECTED:`);
    for (const c of slugChanges) {
      console.log(`  rank ${c.rank}: "${c.oldSlug}" -> "${c.newSlug}"`);
    }
  } else {
    console.log(`[build-seed] no slug changes (all 10 ranks match existing seed slugs)`);
  }
  if (unmatchedFactSourceUrls.length > 0) {
    console.log(`[build-seed] fact sourceUrls with no matching sources[] entry (skipped, pre-existing data issue):`);
    for (const u of unmatchedFactSourceUrls) {
      console.log(`  rank ${u.rank}, fact ${u.factIndex}: ${u.url}`);
    }
  }
}

main();
