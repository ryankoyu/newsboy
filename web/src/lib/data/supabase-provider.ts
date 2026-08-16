import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Category,
  Edition,
  Article,
  ArticleVersion,
  Source,
  Word,
  Gloss,
  EditionWithArticles,
  ArticleWithDetails,
  CefrLevel,
} from "@/lib/types";
import type { DataProvider } from "@/lib/data/provider";
import { splitSentences } from "@/lib/sentences";

/**
 * Supabase-backed DataProvider — the reader's live path.
 *
 * Reads with the ANON key, never the service role, so every query here is
 * filtered by the row-level policies in 0001_schema.sql before it reaches
 * this code. Those policies admit `status = 'published'` and nothing else,
 * which means an article the desk has not approved cannot reach a reader
 * even if a query here forgot to say so. That is deliberate: the guarantee
 * lives in the database, not in the correctness of this file.
 *
 * `facts` has no public policy at all (provenance is internal — the reader
 * sees sources, not the fact ledger), so ArticleWithDetails.facts is always
 * empty on this path. The reader never renders it; the desk console reads
 * facts through the service role.
 */

/** DB row shapes — snake_case, as PostgREST returns them. */
interface WordRow {
  id: string;
  version_id: string;
  term: string;
  meaning_ko: string;
  example: string | null;
  pronunciation: string | null;
  sort_order: number;
  is_key: boolean | null;
  pos: string | null;
}

interface VersionRow {
  id: string;
  article_id: string;
  level: string;
  title: string;
  content: string;
  word_count: number | null;
  created_at: string;
}

interface ArticleRow extends Article {
  article_versions?: VersionRow[] | null;
  sources?: Source[] | null;
  categories?: Category | null;
}

/**
 * `is_key`/`pos` are snake_case columns but camelCase on the web type
 * (lib/types.ts) — the seed JSON was written that way and the components
 * read it that way. Mapped here rather than renaming either side.
 */
function toWord(row: WordRow): Word {
  return {
    id: row.id,
    version_id: row.version_id,
    term: row.term,
    meaning_ko: row.meaning_ko,
    example: row.example,
    pronunciation: row.pronunciation,
    sort_order: row.sort_order,
    isKey: row.is_key ?? false,
    pos: row.pos,
  };
}

/** `content` is one TEXT column; the reader wants sentences (A2 §3-2). */
function toVersion(row: VersionRow): ArticleVersion {
  return {
    id: row.id,
    article_id: row.article_id,
    level: row.level as CefrLevel,
    title: row.title,
    content: row.content,
    word_count: row.word_count,
    created_at: row.created_at,
    sentences: splitSentences(row.content),
  };
}

const LEVEL_ORDER: Record<string, number> = { A2: 0, B1: 1, B2: 2 };

function toArticleWithDetails(row: ArticleRow): ArticleWithDetails {
  const versions = (row.article_versions ?? [])
    .map(toVersion)
    .sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9));

  return {
    id: row.id,
    edition_id: row.edition_id,
    category_id: row.category_id,
    slug: row.slug,
    event_summary: row.event_summary,
    rank_in_edition: row.rank_in_edition,
    status: row.status,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category: row.categories ?? null,
    versions,
    sources: row.sources ?? [],
    // No public policy on facts — see the file comment.
    facts: [],
  };
}

/**
 * One nested select for a whole edition. PostgREST resolves the joins in a
 * single round trip, and the policies filter each nested table on its own,
 * so an article that is not published brings back neither its versions nor
 * its sources.
 */
const ARTICLE_SELECT =
  "*, categories(*), article_versions(*), sources(*)";

function createReadClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseDataProvider(
  url: string,
  anonKey: string
): DataProvider {
  const db = createReadClient(url, anonKey);

  async function editionWithArticles(edition: Edition): Promise<EditionWithArticles> {
    const { data, error } = await db
      .from("articles")
      .select(ARTICLE_SELECT)
      .eq("edition_id", edition.id)
      .order("rank_in_edition", { ascending: true });

    if (error) throw new Error(`[supabaseDataProvider] articles: ${error.message}`);

    return {
      ...edition,
      articles: ((data ?? []) as ArticleRow[]).map(toArticleWithDetails),
    };
  }

  return {
    async getCategories(): Promise<Category[]> {
      const { data, error } = await db
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error(`[supabaseDataProvider] categories: ${error.message}`);
      return (data ?? []) as Category[];
    },

    async getLatestEdition(): Promise<EditionWithArticles | null> {
      const { data, error } = await db
        .from("editions")
        .select("*")
        .order("edition_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`[supabaseDataProvider] latest edition: ${error.message}`);
      if (!data) return null;
      return editionWithArticles(data as Edition);
    },

    async getEditionByDate(editionDate: string): Promise<EditionWithArticles | null> {
      const { data, error } = await db
        .from("editions")
        .select("*")
        .eq("edition_date", editionDate)
        .maybeSingle();
      if (error) throw new Error(`[supabaseDataProvider] edition ${editionDate}: ${error.message}`);
      if (!data) return null;
      return editionWithArticles(data as Edition);
    },

    async getArticleBySlug(slug: string): Promise<ArticleWithDetails | null> {
      const { data, error } = await db
        .from("articles")
        .select(ARTICLE_SELECT)
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw new Error(`[supabaseDataProvider] article ${slug}: ${error.message}`);
      if (!data) return null;
      return toArticleWithDetails(data as ArticleRow);
    },

    async getWordsForVersion(versionId: string): Promise<Word[]> {
      const { data, error } = await db
        .from("words")
        .select("*")
        .eq("version_id", versionId)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(`[supabaseDataProvider] words: ${error.message}`);
      return ((data ?? []) as WordRow[]).map(toWord);
    },

    async listEditions(): Promise<Edition[]> {
      const { data, error } = await db
        .from("editions")
        .select("*")
        .order("edition_date", { ascending: false });
      if (error) throw new Error(`[supabaseDataProvider] editions: ${error.message}`);
      return (data ?? []) as Edition[];
    },

    /**
     * Dictionary meanings for a body's words (0006_glosses.sql).
     *
     * Chunked because a B2 article carries ~200 distinct words and all three
     * levels together run past 300 — enough that one `in (...)` clause starts
     * pushing against URL length limits, which would fail as a confusing
     * network error rather than as a missing word.
     *
     * A failure here returns what it has instead of throwing: the article is
     * already on screen by the time these matter, and losing the whole page
     * because the dictionary lookup failed would trade a small degradation
     * for a total one.
     */
    async getGlosses(terms: readonly string[]): Promise<Record<string, Gloss>> {
      const CHUNK = 150;
      const found: Record<string, Gloss> = {};
      for (let i = 0; i < terms.length; i += CHUNK) {
        const chunk = terms.slice(i, i + CHUNK);
        if (chunk.length === 0) continue;
        const { data, error } = await db
          .from("glosses")
          .select("term, meaning_ko, pos")
          .in("term", chunk as string[]);
        if (error) {
          console.warn(`[supabaseDataProvider] glosses: ${error.message}`);
          return found;
        }
        for (const row of (data ?? []) as Gloss[]) found[row.term] = row;
      }
      return found;
    },
  };
}
