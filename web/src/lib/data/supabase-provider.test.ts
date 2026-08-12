import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * These tests pin the SHAPE the provider hands the reader — level order,
 * sentence splitting, is_key/pos renaming, empty facts — because those are
 * where the Supabase path can silently differ from the seed path and give
 * two readers different articles from the same content.
 *
 * They do NOT prove the queries are right against a real schema. A fake
 * client that accepts any table and column cannot catch a typo'd column,
 * which is exactly how the pipeline's adapter shipped writing is_key to a
 * table that had no such column. Treat green here as "the mapping is
 * right", never as "the queries work".
 */

const rows: Record<string, unknown> = {};

vi.mock("@supabase/supabase-js", () => {
  function builder(table: string) {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: rows[`${table}:single`] ?? null, error: null }),
      then: undefined as unknown,
    };
    // Awaiting the chain resolves to the list result.
    (chain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows[table] ?? [], error: null });
    return chain;
  }
  return { createClient: () => ({ from: (table: string) => builder(table) }) };
});

const { createSupabaseDataProvider } = await import("@/lib/data/supabase-provider");

const provider = createSupabaseDataProvider("https://example.supabase.co", "anon-key");

beforeEach(() => {
  for (const k of Object.keys(rows)) delete rows[k];
});

describe("supabaseDataProvider", () => {
  it("splits content into sentences the same way the seed path does", async () => {
    rows["articles:single"] = {
      id: "a1",
      slug: "quake",
      status: "published",
      article_versions: [
        {
          id: "v1",
          article_id: "a1",
          level: "A2",
          title: "T",
          content: "A quake hit. Many people left.\n\nHelp arrived.",
          word_count: 8,
          created_at: "2026-08-12T00:00:00Z",
        },
      ],
    };

    const article = await provider.getArticleBySlug("quake");
    expect(article?.versions[0].sentences).toEqual([
      "A quake hit.",
      "Many people left.",
      "Help arrived.",
    ]);
  });

  it("orders versions A2 → B1 → B2 regardless of row order", async () => {
    const v = (level: string, id: string) => ({
      id,
      article_id: "a1",
      level,
      title: level,
      content: "One sentence.",
      word_count: 2,
      created_at: "2026-08-12T00:00:00Z",
    });
    rows["articles:single"] = {
      id: "a1",
      slug: "s",
      status: "published",
      article_versions: [v("B2", "v3"), v("A2", "v1"), v("B1", "v2")],
    };

    const article = await provider.getArticleBySlug("s");
    expect(article?.versions.map((x) => x.level)).toEqual(["A2", "B1", "B2"]);
  });

  it("renames is_key/pos to the camelCase the components read", async () => {
    rows["words"] = [
      {
        id: "w1",
        version_id: "v1",
        term: "quake",
        meaning_ko: "지진",
        example: null,
        pronunciation: null,
        sort_order: 1,
        is_key: true,
        pos: "n.",
      },
    ];

    const [word] = await provider.getWordsForVersion("v1");
    expect(word.isKey).toBe(true);
    expect(word.pos).toBe("n.");
    // The snake_case keys must not leak through — a component reading
    // word.isKey would silently render nothing.
    expect("is_key" in word).toBe(false);
  });

  it("treats a missing is_key as not-key rather than undefined", async () => {
    rows["words"] = [
      {
        id: "w1",
        version_id: "v1",
        term: "quake",
        meaning_ko: "지진",
        example: null,
        pronunciation: null,
        sort_order: 1,
        is_key: null,
        pos: null,
      },
    ];
    const [word] = await provider.getWordsForVersion("v1");
    expect(word.isKey).toBe(false);
  });

  it("returns no facts — the reader has no policy to read them", async () => {
    rows["articles:single"] = { id: "a1", slug: "s", status: "published", article_versions: [] };
    const article = await provider.getArticleBySlug("s");
    expect(article?.facts).toEqual([]);
  });

  it("returns null rather than throwing when an article does not exist", async () => {
    expect(await provider.getArticleBySlug("missing")).toBeNull();
  });

  it("returns null when there is no edition at all", async () => {
    expect(await provider.getLatestEdition()).toBeNull();
  });
});
