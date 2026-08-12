import { describe, expect, it, vi } from "vitest";
import { SupabaseStorageAdapter } from "./supabase.js";
import { CHECKPOINT_MAX_AGE_HOURS } from "./adapter.js";
import type {
  PipelineArticle,
  PipelineCheckpoint,
  PipelineEdition,
  PipelineRun,
} from "../types.js";

/**
 * Minimal mock of the supabase-js query-builder chain. Records every
 * from/method/args call so tests can assert exact table + payload mapping
 * without a network connection. The project is real, but a test that wrote to
 * it would need service-role credentials in CI and would leave rows behind,
 * so the mapping is pinned here instead — see storage/supabase.ts header.
 *
 * Each chain call (upsert/insert/select/delete/eq/lt/single/maybeSingle) is
 * thenable so `await` on any point in the chain resolves to { data, error }.
 *
 * A table's response may be an array when one method issues more than one
 * query against the same table and the test needs them to differ — the
 * checkpoint sweep followed by the checkpoint read. Entries are consumed in
 * order and the last one repeats once the list runs out, so the common case
 * (a single object) keeps behaving as before.
 */
interface Call {
  table: string;
  method: string;
  args: unknown[];
}

type MockResponse = { data?: unknown; error?: unknown };

function createMockSupabaseClient(
  responses: Record<string, MockResponse | MockResponse[]> = {},
) {
  const calls: Call[] = [];
  const consumed: Record<string, number> = {};

  function makeChain(table: string) {
    const state: { lastData: unknown } = { lastData: undefined };

    const chain: any = {
      insert: (rows: unknown) => {
        calls.push({ table, method: "insert", args: [rows] });
        return chain;
      },
      upsert: (rows: unknown, opts?: unknown) => {
        calls.push({ table, method: "upsert", args: [rows, opts] });
        return chain;
      },
      delete: () => {
        calls.push({ table, method: "delete", args: [] });
        return chain;
      },
      select: (cols?: string) => {
        calls.push({ table, method: "select", args: [cols] });
        return chain;
      },
      eq: (col: string, val: unknown) => {
        calls.push({ table, method: "eq", args: [col, val] });
        return chain;
      },
      lt: (col: string, val: unknown) => {
        calls.push({ table, method: "lt", args: [col, val] });
        return chain;
      },
      single: () => {
        calls.push({ table, method: "single", args: [] });
        return resolveFor(table);
      },
      maybeSingle: () => {
        calls.push({ table, method: "maybeSingle", args: [] });
        return resolveFor(table);
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        return resolveFor(table).then(resolve, reject);
      },
    };
    return chain;
  }

  function resolveFor(table: string): Promise<{ data: unknown; error: unknown }> {
    const configured = responses[table];
    if (!configured) return Promise.resolve({ data: null, error: null });

    const step = Array.isArray(configured)
      ? configured[Math.min(consumed[table] ?? 0, configured.length - 1)]
      : configured;
    consumed[table] = (consumed[table] ?? 0) + 1;
    return Promise.resolve({ data: step?.data ?? null, error: step?.error ?? null });
  }

  const client = {
    from: (table: string) => makeChain(table),
  };

  return { client, calls };
}

function gatedVersionFixture(level: "A2" | "B1" | "B2") {
  return {
    version: {
      level,
      title: `Title ${level}`,
      content: "First sentence here. Second sentence follows now.",
      wordCount: 8,
      words: [
        { term: "layoff", meaningKo: "해고", example: "ex", pronunciation: "ipa", sortOrder: 0 },
      ],
    },
    checks: [
      { kind: "cefr" as const, level, score: 12, passed: true, detail: { foo: "bar" } },
      { kind: "ngram_overlap" as const, level, score: 0.01, passed: true, detail: {} },
    ],
    passed: true,
    rewriteAttempts: 1,
  };
}

function articleFixture(overrides: Partial<PipelineArticle> = {}): PipelineArticle {
  return {
    id: "article-1",
    slug: "sample-article-1",
    category: "world",
    rankInEdition: 1,
    status: "review",
    eventSummary: "Sample event",
    sources: [
      { url: "https://example.com/a", outlet: "Outlet A", title: "A", fetchMethod: "rss_summary" },
      { url: "https://example.com/b", outlet: "Outlet B", title: "B", fetchMethod: "rss_summary" },
    ],
    facts: [
      {
        statement: "Something happened.",
        confirmedByOutlets: ["Outlet A", "Outlet B"],
        sourceCount: 2,
        usedInText: true,
        searchSummaryOnly: false,
      },
    ],
    versions: [gatedVersionFixture("A2"), gatedVersionFixture("B1"), gatedVersionFixture("B2")],
    createdAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

function editionFixture(overrides: Partial<PipelineEdition> = {}): PipelineEdition {
  return {
    id: "edition-1",
    editionDate: "2026-07-10",
    status: "draft",
    articles: [articleFixture()],
    ...overrides,
  };
}

describe("SupabaseStorageAdapter — constructor guards", () => {
  it("throws a clear error when SUPABASE_URL / SERVICE_ROLE_KEY are missing", () => {
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(() => new SupabaseStorageAdapter()).toThrow(/SUPABASE_URL/);

    if (prevUrl) process.env.SUPABASE_URL = prevUrl;
    if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  });
});

describe("SupabaseStorageAdapter — saveEdition mapping", () => {
  it("upserts editions on edition_date and never writes a non-draft/non-review status", async () => {
    const { client, calls } = createMockSupabaseClient({
      editions: { data: { id: "edition-1" } },
      sources: {
        data: [
          { id: "src-1", url: "https://example.com/a", outlet: "Outlet A" },
          { id: "src-2", url: "https://example.com/b", outlet: "Outlet B" },
        ],
      },
      facts: { data: [{ id: "fact-1", statement: "Something happened." }] },
      article_versions: { data: { id: "version-1" } },
    });

    const adapter = SupabaseStorageAdapter.withClient(client as any);
    await adapter.saveEdition(editionFixture());

    const editionUpsert = calls.find((c) => c.table === "editions" && c.method === "upsert");
    expect(editionUpsert).toBeDefined();
    const [rows, opts] = editionUpsert!.args as [any, any];
    expect(rows).toMatchObject({ edition_date: "2026-07-10", status: "draft" });
    expect(opts).toMatchObject({ onConflict: "edition_date" });
  });

  it("deletes existing articles for the edition before inserting the fresh set (replace strategy)", async () => {
    const { client, calls } = createMockSupabaseClient({
      editions: { data: { id: "edition-1" } },
      sources: { data: [{ id: "src-1", url: "https://example.com/a", outlet: "Outlet A" }] },
      facts: { data: [{ id: "fact-1", statement: "Something happened." }] },
      article_versions: { data: { id: "version-1" } },
    });

    const adapter = SupabaseStorageAdapter.withClient(client as any);
    await adapter.saveEdition(editionFixture());

    const deleteCall = calls.find((c) => c.table === "articles" && c.method === "delete");
    expect(deleteCall).toBeDefined();
    const eqAfterDelete = calls.find(
      (c, i) =>
        c.table === "articles" &&
        c.method === "eq" &&
        i > calls.indexOf(deleteCall!) &&
        (c.args[0] === "edition_id"),
    );
    expect(eqAfterDelete).toBeDefined();

    const insertCall = calls.find((c) => c.table === "articles" && c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(calls.indexOf(insertCall!)).toBeGreaterThan(calls.indexOf(deleteCall!));
  });

  it("maps article fields to the articles table with status forced to review", async () => {
    const { client, calls } = createMockSupabaseClient({
      editions: { data: { id: "edition-1" } },
      sources: { data: [{ id: "src-1", url: "https://example.com/a", outlet: "Outlet A" }] },
      facts: { data: [{ id: "fact-1", statement: "Something happened." }] },
      article_versions: { data: { id: "version-1" } },
    });

    const adapter = SupabaseStorageAdapter.withClient(client as any);
    await adapter.saveEdition(editionFixture());

    const insertCall = calls.find((c) => c.table === "articles" && c.method === "insert");
    const row = (insertCall!.args[0] as any[]) ?? insertCall!.args[0];
    const articleRow = Array.isArray(row) ? row[0] : row;
    expect(articleRow).toMatchObject({
      id: "article-1",
      edition_id: "edition-1",
      slug: "sample-article-1",
      event_summary: "Sample event",
      rank_in_edition: 1,
      status: "review",
    });
  });

  it("maps sources rows one-per-source with the correct fetch_method", async () => {
    const { client, calls } = createMockSupabaseClient({
      editions: { data: { id: "edition-1" } },
      sources: {
        data: [
          { id: "src-1", url: "https://example.com/a", outlet: "Outlet A" },
          { id: "src-2", url: "https://example.com/b", outlet: "Outlet B" },
        ],
      },
      facts: { data: [{ id: "fact-1", statement: "Something happened." }] },
      article_versions: { data: { id: "version-1" } },
    });

    const adapter = SupabaseStorageAdapter.withClient(client as any);
    await adapter.saveEdition(editionFixture());

    const sourcesInsert = calls.find((c) => c.table === "sources" && c.method === "insert");
    const rows = sourcesInsert!.args[0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      article_id: "article-1",
      url: "https://example.com/a",
      outlet: "Outlet A",
      fetch_method: "rss_summary",
    });
  });

  it("maps facts + fact_sources for provenance, linking by outlet name", async () => {
    const { client, calls } = createMockSupabaseClient({
      editions: { data: { id: "edition-1" } },
      sources: {
        data: [
          { id: "src-1", url: "https://example.com/a", outlet: "Outlet A" },
          { id: "src-2", url: "https://example.com/b", outlet: "Outlet B" },
        ],
      },
      facts: { data: [{ id: "fact-1", statement: "Something happened." }] },
      article_versions: { data: { id: "version-1" } },
    });

    const adapter = SupabaseStorageAdapter.withClient(client as any);
    await adapter.saveEdition(editionFixture());

    const factsInsert = calls.find((c) => c.table === "facts" && c.method === "insert");
    const factRows = factsInsert!.args[0] as any[];
    expect(factRows[0]).toMatchObject({
      article_id: "article-1",
      statement: "Something happened.",
      source_count: 2,
      used_in_text: true,
    });

    const factSourcesInsert = calls.find((c) => c.table === "fact_sources" && c.method === "insert");
    expect(factSourcesInsert).toBeDefined();
    const linkRows = factSourcesInsert!.args[0] as any[];
    // Fact confirmed by both Outlet A and Outlet B -> 2 link rows.
    expect(linkRows).toHaveLength(2);
    expect(linkRows.map((r) => r.source_id).sort()).toEqual(["src-1", "src-2"]);
    for (const r of linkRows) {
      expect(r.fact_id).toBe("fact-1");
      expect(r.search_summary_only).toBe(false);
    }
  });

  it("maps article_versions (3 levels) + words scoped to version_id + quality_checks", async () => {
    const { client, calls } = createMockSupabaseClient({
      editions: { data: { id: "edition-1" } },
      sources: { data: [{ id: "src-1", url: "https://example.com/a", outlet: "Outlet A" }] },
      facts: { data: [{ id: "fact-1", statement: "Something happened." }] },
      article_versions: { data: { id: "version-1" } },
    });

    const adapter = SupabaseStorageAdapter.withClient(client as any);
    await adapter.saveEdition(editionFixture());

    const versionInserts = calls.filter((c) => c.table === "article_versions" && c.method === "insert");
    expect(versionInserts).toHaveLength(3); // A2, B1, B2

    const firstVersionRow = versionInserts[0].args[0] as any;
    expect(firstVersionRow).toMatchObject({
      article_id: "article-1",
      level: "A2",
      title: "Title A2",
    });
    expect(Array.isArray(firstVersionRow.sentences)).toBe(true);
    expect(firstVersionRow.sentences.length).toBeGreaterThan(0);

    const wordsInserts = calls.filter((c) => c.table === "words" && c.method === "insert");
    expect(wordsInserts).toHaveLength(3);
    const wordRow = (wordsInserts[0].args[0] as any[])[0];
    expect(wordRow).toMatchObject({
      version_id: "version-1",
      term: "layoff",
      meaning_ko: "해고",
    });

    const qcInserts = calls.filter((c) => c.table === "quality_checks" && c.method === "insert");
    expect(qcInserts).toHaveLength(3);
    const qcRows = qcInserts[0].args[0] as any[];
    expect(qcRows).toHaveLength(2); // cefr + ngram_overlap per fixture
    expect(qcRows[0]).toMatchObject({ version_id: "version-1", kind: "cefr", passed: true });
  });

  it("never writes quizzes/quiz_options (explicitly out of MVP scope)", async () => {
    const { client, calls } = createMockSupabaseClient({
      editions: { data: { id: "edition-1" } },
      sources: { data: [{ id: "src-1", url: "https://example.com/a", outlet: "Outlet A" }] },
      facts: { data: [{ id: "fact-1", statement: "Something happened." }] },
      article_versions: { data: { id: "version-1" } },
    });

    const adapter = SupabaseStorageAdapter.withClient(client as any);
    await adapter.saveEdition(editionFixture());

    expect(calls.some((c) => c.table === "quizzes")).toBe(false);
    expect(calls.some((c) => c.table === "quiz_options")).toBe(false);
  });

  it("refuses to write an edition with a non-draft status", async () => {
    const { client } = createMockSupabaseClient({ editions: { data: { id: "edition-1" } } });
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    await expect(
      adapter.saveEdition(editionFixture({ status: "published" as any })),
    ).rejects.toThrow(/refusing to write edition status='published'/);
  });

  it("refuses to write an article with status other than 'review' (no auto-approve/publish)", async () => {
    const { client } = createMockSupabaseClient({ editions: { data: { id: "edition-1" } } });
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    const edition = editionFixture({
      articles: [articleFixture({ status: "approved" as any })],
    });

    await expect(adapter.saveEdition(edition)).rejects.toThrow(
      /refusing to write article status='approved'/,
    );
  });
});

describe("SupabaseStorageAdapter — recordPipelineRun mapping", () => {
  it("explodes run.stages[] into one pipeline_runs row per stage", async () => {
    const { client, calls } = createMockSupabaseClient({
      pipeline_runs: { data: null },
    });
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    const run: PipelineRun = {
      id: "run-1",
      startedAt: "2026-07-10T00:00:00.000Z",
      finishedAt: "2026-07-10T00:10:00.000Z",
      editionDate: "2026-07-10",
      status: "success",
      stages: [
        {
          stage: "collect",
          startedAt: "2026-07-10T00:00:00.000Z",
          finishedAt: "2026-07-10T00:01:00.000Z",
          ok: true,
          detail: {},
        },
        {
          stage: "cluster",
          startedAt: "2026-07-10T00:01:00.000Z",
          finishedAt: "2026-07-10T00:02:00.000Z",
          ok: false,
          detail: {},
          error: "boom",
        },
      ],
      articlesProduced: 0,
    };

    await adapter.recordPipelineRun(run);

    const insertCall = calls.find((c) => c.table === "pipeline_runs" && c.method === "insert");
    expect(insertCall).toBeDefined();
    const rows = insertCall!.args[0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      run_date: "2026-07-10",
      stage: "collect",
      status: "success",
      error: null,
    });
    expect(rows[1]).toMatchObject({
      run_date: "2026-07-10",
      stage: "cluster",
      status: "failed",
      error: "boom",
    });
  });

  it("does nothing when there are no stages recorded", async () => {
    const { client, calls } = createMockSupabaseClient();
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    const run: PipelineRun = {
      id: "run-1",
      startedAt: "2026-07-10T00:00:00.000Z",
      finishedAt: null,
      editionDate: "2026-07-10",
      status: "running",
      stages: [],
      articlesProduced: 0,
    };

    await adapter.recordPipelineRun(run);
    expect(calls.some((c) => c.table === "pipeline_runs")).toBe(false);
  });
});

describe("SupabaseStorageAdapter — getEdition", () => {
  it("returns null when no edition row exists for the date", async () => {
    const { client } = createMockSupabaseClient({ editions: { data: null } });
    const adapter = SupabaseStorageAdapter.withClient(client as any);
    const result = await adapter.getEdition("2026-01-01");
    expect(result).toBeNull();
  });

  it("reassembles edition + article shell fields when a row exists", async () => {
    const { client } = createMockSupabaseClient({
      editions: { data: { id: "edition-1", edition_date: "2026-07-10", status: "draft" } },
      articles: {
        data: [
          {
            id: "article-1",
            slug: "sample-article-1",
            event_summary: "Sample event",
            rank_in_edition: 1,
            status: "review",
            created_at: "2026-07-10T00:00:00.000Z",
            category_id: null,
          },
        ],
      },
    });
    const adapter = SupabaseStorageAdapter.withClient(client as any);
    const result = await adapter.getEdition("2026-07-10");

    expect(result).toMatchObject({
      id: "edition-1",
      editionDate: "2026-07-10",
      status: "draft",
    });
    expect(result!.articles).toHaveLength(1);
    expect(result!.articles[0]).toMatchObject({
      id: "article-1",
      slug: "sample-article-1",
      status: "review",
    });
  });
});

/**
 * Checkpoints in Supabase mode go to a table, not a file (0005). The reason
 * is the runner: GitHub Actions gives each job a fresh machine, so a
 * file-backed checkpoint made "resume from the last successful stage" true
 * only on a developer's laptop. These tests pin the table, the columns and
 * the expiry sweep, because nothing else here can — a real resume needs a
 * job that dies, which no unit test can stage.
 */
describe("SupabaseStorageAdapter — checkpoints outlive the runner", () => {
  function checkpointFixture(): PipelineCheckpoint {
    return {
      editionDate: "2026-07-10",
      runId: "run-1",
      updatedAt: "2026-07-10T03:00:00.000Z",
    };
  }

  it("upserts the whole checkpoint into pipeline_checkpoints, keyed by edition_date", async () => {
    const { client, calls } = createMockSupabaseClient();
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    const checkpoint = checkpointFixture();
    await adapter.saveCheckpoint(checkpoint);

    const upsert = calls.find(
      (c) => c.table === "pipeline_checkpoints" && c.method === "upsert",
    );
    expect(upsert).toBeDefined();
    const [row, opts] = upsert!.args as [any, any];
    expect(row).toMatchObject({
      edition_date: "2026-07-10",
      run_id: "run-1",
      updated_at: "2026-07-10T03:00:00.000Z",
    });
    // The payload is the checkpoint itself — run.ts reads updatedAt off it.
    expect(row.payload).toEqual(checkpoint);
    // Without this a same-day re-run would pile up rows and the read would
    // have no way to pick the right one.
    expect(opts).toMatchObject({ onConflict: "edition_date" });
  });

  it("reads the checkpoint back out of the payload column", async () => {
    const checkpoint = checkpointFixture();
    const { client } = createMockSupabaseClient({
      pipeline_checkpoints: [{ data: null }, { data: { payload: checkpoint } }],
    });
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    await expect(adapter.loadCheckpoint("2026-07-10")).resolves.toEqual(checkpoint);
  });

  it("returns null when the date has no checkpoint row", async () => {
    const { client } = createMockSupabaseClient({ pipeline_checkpoints: { data: null } });
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    await expect(adapter.loadCheckpoint("2026-01-01")).resolves.toBeNull();
  });

  it("sweeps rows older than the resume window before reading", async () => {
    const { client, calls } = createMockSupabaseClient();
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    const before = Date.now();
    await adapter.loadCheckpoint("2026-07-10");
    const after = Date.now();

    const sweep = calls.find(
      (c) => c.table === "pipeline_checkpoints" && c.method === "lt",
    );
    expect(sweep).toBeDefined();
    expect(sweep!.args[0]).toBe("updated_at");

    // A payload carries a day of collected article text; rows run.ts would
    // refuse to resume from must not sit in the project forever.
    const cutoff = new Date(sweep!.args[1] as string).getTime();
    const window = CHECKPOINT_MAX_AGE_HOURS * 3600_000;
    expect(cutoff).toBeGreaterThanOrEqual(before - window);
    expect(cutoff).toBeLessThanOrEqual(after - window);

    const deleteCall = calls.find(
      (c) => c.table === "pipeline_checkpoints" && c.method === "delete",
    );
    const selectCall = calls.find(
      (c) => c.table === "pipeline_checkpoints" && c.method === "select",
    );
    expect(calls.indexOf(deleteCall!)).toBeLessThan(calls.indexOf(selectCall!));
  });

  it("still returns the checkpoint when the expiry sweep fails", async () => {
    const checkpoint = checkpointFixture();
    const { client } = createMockSupabaseClient({
      pipeline_checkpoints: [
        { error: { message: "sweep boom" } },
        { data: { payload: checkpoint } },
      ],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    // Housekeeping failing is not a reason to re-pay for a run's rewrites.
    await expect(adapter.loadCheckpoint("2026-07-10")).resolves.toEqual(checkpoint);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws (rather than reporting 'no checkpoint') when the read itself fails", async () => {
    const { client } = createMockSupabaseClient({
      pipeline_checkpoints: [{ data: null }, { error: { message: "read boom" } }],
    });
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    // run.ts catches this and starts over — but the log has to say why, or a
    // broken connection looks identical to a first run of the day.
    await expect(adapter.loadCheckpoint("2026-07-10")).rejects.toThrow(/read boom/);
  });

  it("deletes only this date's row when the edition is safely stored", async () => {
    const { client, calls } = createMockSupabaseClient();
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    await adapter.clearCheckpoint("2026-07-10");

    const deleteCall = calls.find(
      (c) => c.table === "pipeline_checkpoints" && c.method === "delete",
    );
    expect(deleteCall).toBeDefined();
    const eqCall = calls.find(
      (c) => c.table === "pipeline_checkpoints" && c.method === "eq",
    );
    expect(eqCall!.args).toEqual(["edition_date", "2026-07-10"]);
  });

  it("surfaces a failed checkpoint write instead of pretending it landed", async () => {
    const { client } = createMockSupabaseClient({
      pipeline_checkpoints: { error: { message: "write boom" } },
    });
    const adapter = SupabaseStorageAdapter.withClient(client as any);

    await expect(adapter.saveCheckpoint(checkpointFixture())).rejects.toThrow(/write boom/);
  });
});
