import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Client } from "pg";

/**
 * The adapter against a REAL Postgres with the real migrations applied.
 *
 * Every other test in this directory drives a fake client that accepts any
 * table and any column, so none of them can fail when the code writes a
 * column the schema does not have. That is not hypothetical: `is_key` and
 * `pos` shipped being written to a `words` table with no such columns, the
 * unit tests stayed green, and the data was silently dropped on every paid
 * run until someone read the schema by hand.
 *
 * This file exists to make that class of bug impossible to miss. It applies
 * supabase/migrations/*.sql in order to a throwaway database and asserts on
 * what actually lands in it — so a column rename, a missing enum value, a
 * broken foreign key or a violated primary key fails here rather than eight
 * minutes and $1.53 into a run.
 *
 * Postgres is downloaded and run in-process (embedded-postgres) rather than
 * requiring Docker or a local install, because a test that needs setup is a
 * test this project will not run.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, "../../../supabase/migrations");
const DATA_DIR = path.resolve(HERE, "../../.pg-test");
const PORT = 54329;

let pg: EmbeddedPostgres | null = null;
let client: Client | null = null;

/**
 * The migrations are written for Supabase, which provides roles and
 * extensions a bare Postgres does not. Only the pieces that exist purely to
 * satisfy that environment are neutralised — tables, columns, types,
 * constraints and defaults all run exactly as written, because those are
 * what this test is here to check.
 */
function forPlainPostgres(sql: string): string {
  return (
    sql
      // `create policy ... to anon` needs roles Supabase creates. RLS itself
      // is asserted through the reader's key against the live project, not
      // here; what matters here is the shape of the data.
      .replace(/create policy[\s\S]*?;/gi, "")
      .replace(/alter table \w+ enable row level security;/gi, "")
      .replace(/grant [\s\S]*?;/gi, "")
      .replace(/revoke [\s\S]*?;/gi, "")
  );
}

beforeAll(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: false,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("newsboy_test");

  client = new Client({
    host: "localhost",
    port: PORT,
    user: "postgres",
    password: "postgres",
    database: "newsboy_test",
  });
  await client.connect();

  // Supabase ships an `auth` schema with `auth.users`; a bare Postgres does
  // not. The user tables reference it, so stand up just enough for the
  // foreign keys to resolve. This is infrastructure the platform provides,
  // not part of the schema under test.
  await client.query(`
    create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid());
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  `);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = forPlainPostgres(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
    try {
      await client.query(sql);
    } catch (err) {
      throw new Error(`마이그레이션 ${file} 적용 실패: ${(err as Error).message}`);
    }
  }
}, 180_000);

afterAll(async () => {
  await client?.end();
  await pg?.stop();
});

async function columnsOf(table: string): Promise<Set<string>> {
  const { rows } = await client!.query(
    "select column_name from information_schema.columns where table_name = $1",
    [table],
  );
  return new Set(rows.map((r) => r.column_name as string));
}

describe("migrations apply to a real Postgres", () => {
  it("creates the tables the adapter writes to", async () => {
    const { rows } = await client!.query(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const tables = new Set(rows.map((r) => r.table_name as string));
    for (const t of [
      "editions",
      "articles",
      "article_versions",
      "words",
      "sources",
      "facts",
      "fact_sources",
      "quality_checks",
      "pipeline_runs",
      "categories",
      "pipeline_checkpoints",
      "glosses",
    ]) {
      expect(tables, `missing table: ${t}`).toContain(t);
    }
  });

  it("has the words columns the adapter writes — the ones that shipped missing", async () => {
    const cols = await columnsOf("words");
    expect(cols).toContain("is_key");
    expect(cols).toContain("pos");
  });

  it("accepts 'held' as an article status", async () => {
    const { rows } = await client!.query(
      "select unnest(enum_range(null::article_status))::text as v",
    );
    const values = rows.map((r) => r.v as string);
    expect(values).toContain("held");
    expect(values).toContain("published");
  });

  it("seeds categories with the ids the web seed uses", async () => {
    const { rows } = await client!.query("select id, slug from categories order by id");
    expect(rows.map((r) => `${r.id}:${r.slug}`)).toEqual([
      "1:world",
      "2:korea",
      "3:ai",
      "4:tech",
      "5:business",
      "6:finance",
      "7:science",
      "8:sports",
      "9:culture",
      "10:lifestyle",
    ]);
  });

  it("continues category ids after the seed instead of colliding with it", async () => {
    const { rows } = await client!.query(
      "insert into categories (slug, label, emoji, sort_order) values ('temp','Temp',null,99) returning id",
    );
    expect(Number(rows[0].id)).toBeGreaterThanOrEqual(11);
    await client!.query("delete from categories where slug = 'temp'");
  });
});

describe("the constraints that killed real runs", () => {
  it("rejects a duplicate (fact_id, source_id) — why fact_sources is deduplicated", async () => {
    const ed = await client!.query(
      "insert into editions (edition_date) values ('2030-01-01') returning id",
    );
    const art = await client!.query(
      "insert into articles (edition_id, slug, status) values ($1, 'dup-test', 'review') returning id",
      [ed.rows[0].id],
    );
    const src = await client!.query(
      "insert into sources (article_id, url, outlet) values ($1, 'https://e.com', 'E') returning id",
      [art.rows[0].id],
    );
    const fact = await client!.query(
      "insert into facts (article_id, statement, source_count) values ($1, 'S', 2) returning id",
      [art.rows[0].id],
    );
    const pair = [fact.rows[0].id, src.rows[0].id];

    await client!.query("insert into fact_sources (fact_id, source_id) values ($1, $2)", pair);
    await expect(
      client!.query("insert into fact_sources (fact_id, source_id) values ($1, $2)", pair),
    ).rejects.toThrow();

    await client!.query("delete from editions where edition_date = '2030-01-01'");
  });

  it("keeps the gloss a reader already saw when a later edition re-glosses the word", async () => {
    // The adapter upserts with ignoreDuplicates, which compiles to
    // ON CONFLICT DO NOTHING. If it ever became DO UPDATE, a word a reader
    // saved to their vocabulary list would silently change meaning under them.
    await client!.query(
      "insert into glosses (term, meaning_ko, pos) values ('ferry', '여객선', 'n.')",
    );
    await client!.query(
      `insert into glosses (term, meaning_ko, pos) values ('ferry', '나룻배', 'n.')
       on conflict (term) do nothing`,
    );
    const { rows } = await client!.query("select meaning_ko from glosses where term = 'ferry'");
    expect(rows).toHaveLength(1);
    expect(rows[0].meaning_ko).toBe("여객선");

    await client!.query("delete from glosses where term = 'ferry'");
  });

  it("stores a gloss with no part of speech — the model does not always give one", async () => {
    await client!.query("insert into glosses (term, meaning_ko) values ('overnight', '밤새')");
    const { rows } = await client!.query("select pos from glosses where term = 'overnight'");
    expect(rows[0].pos).toBeNull();

    await client!.query("delete from glosses where term = 'overnight'");
  });

  it("rejects a gloss with no meaning — an empty card is worse than an absent one", async () => {
    await expect(
      client!.query("insert into glosses (term) values ('rescuers')"),
    ).rejects.toThrow();
  });

  it("rejects a second article with the same slug — why slugs carry the date", async () => {
    const ed = await client!.query(
      "insert into editions (edition_date) values ('2030-01-02') returning id",
    );
    await client!.query(
      "insert into articles (edition_id, slug, status) values ($1, 'same-slug', 'review')",
      [ed.rows[0].id],
    );
    await expect(
      client!.query(
        "insert into articles (edition_id, slug, status) values ($1, 'same-slug', 'review')",
        [ed.rows[0].id],
      ),
    ).rejects.toThrow();

    await client!.query("delete from editions where edition_date = '2030-01-02'");
  });

  it("keeps an edition's id across an upsert on edition_date — why the payload drops id", async () => {
    // The adapter used to send a fresh UUID with onConflict(edition_date),
    // so DO UPDATE overwrote the primary key and orphaned every article.
    const first = await client!.query(
      "insert into editions (edition_date) values ('2030-01-03') returning id",
    );
    const originalId = first.rows[0].id;

    await client!.query(
      "insert into articles (edition_id, slug, status) values ($1, 'child', 'review')",
      [originalId],
    );

    // Upsert the way the adapter does now: no id in the payload.
    const again = await client!.query(
      `insert into editions (edition_date, status) values ('2030-01-03', 'draft')
       on conflict (edition_date) do update set status = excluded.status
       returning id`,
    );
    expect(again.rows[0].id).toBe(originalId);

    const child = await client!.query(
      "select edition_id from articles where slug = 'child'",
    );
    expect(child.rows[0].edition_id).toBe(originalId);

    await client!.query("delete from editions where edition_date = '2030-01-03'");
  });
});
