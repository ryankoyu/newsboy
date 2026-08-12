import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * publishEditionToSupabase is the only writer of `status = 'published'` in
 * the codebase, and the row-level policies make that column the sole thing
 * standing between a draft and a reader. So what these tests guard is not
 * "does the update run" but "can an unapproved story reach the public" —
 * every case below is a way that could happen.
 */

interface Call {
  table: string;
  op: string;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown, unknown?]>;
}

let calls: Call[] = [];
let editionRow: { id: string } | null = { id: "ed-1" };
let failOn: string | null = null;

vi.mock("@supabase/supabase-js", () => {
  function builder(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const chain = {
      select: () => chain,
      update: (payload: Record<string, unknown>) => {
        call.op = "update";
        call.payload = payload;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        call.filters.push([`eq:${col}`, val]);
        return chain;
      },
      in: (col: string, val: unknown) => {
        call.filters.push([`in:${col}`, val]);
        return chain;
      },
      not: (col: string, op: string, val: unknown) => {
        call.filters.push([`not:${col}`, op, val]);
        return chain;
      },
      maybeSingle: async () =>
        failOn === table
          ? { data: null, error: { message: "boom" } }
          : { data: editionRow, error: null },
      then: undefined as unknown,
    };
    (chain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) =>
      resolve(
        failOn === `${table}:${call.op}`
          ? { data: null, error: { message: "boom" } }
          : { data: [{ id: "x" }], error: null }
      );
    return chain;
  }
  return { createClient: () => ({ from: (table: string) => builder(table) }) };
});

const { publishEditionToSupabase, isSupabasePublishConfigured, SupabasePublishError } =
  await import("@/lib/admin/publishToSupabase");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  calls = [];
  editionRow = { id: "ed-1" };
  failOn = null;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isSupabasePublishConfigured", () => {
  it("is false without a service role key — the anon key cannot publish", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(isSupabasePublishConfigured()).toBe(false);
  });
});

describe("publishEditionToSupabase", () => {
  it("publishes only the article ids it was given", async () => {
    await publishEditionToSupabase("2026-08-12", ["a1", "a2"]);

    const publish = calls.find(
      (c) => c.table === "articles" && c.payload?.status === "published"
    );
    expect(publish).toBeDefined();
    expect(publish!.filters).toContainEqual(["in:id", ["a1", "a2"]]);
    // Scoped to this edition, so a stray id from another day cannot be
    // published by passing it in.
    expect(publish!.filters).toContainEqual(["eq:edition_id", "ed-1"]);
  });

  it("withdraws previously published articles that are no longer approved", async () => {
    await publishEditionToSupabase("2026-08-12", ["a1"]);

    const withdraw = calls.find(
      (c) => c.table === "articles" && c.payload?.status === "review"
    );
    expect(withdraw).toBeDefined();
    expect(withdraw!.payload).toEqual({ status: "review", published_at: null });
    expect(withdraw!.filters).toContainEqual(["eq:status", "published"]);
  });

  it("withdraws before it publishes", async () => {
    await publishEditionToSupabase("2026-08-12", ["a1"]);
    const ops = calls
      .filter((c) => c.table === "articles" && c.op === "update")
      .map((c) => c.payload?.status);
    expect(ops).toEqual(["review", "published"]);
  });

  it("marks the edition published only after its articles", async () => {
    await publishEditionToSupabase("2026-08-12", ["a1"]);
    const order = calls.filter((c) => c.op === "update").map((c) => c.table);
    expect(order[order.length - 1]).toBe("editions");
  });

  it("refuses an empty approval list", async () => {
    await expect(publishEditionToSupabase("2026-08-12", [])).rejects.toBeInstanceOf(
      SupabasePublishError
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses when credentials are missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(publishEditionToSupabase("2026-08-12", ["a1"])).rejects.toBeInstanceOf(
      SupabasePublishError
    );
  });

  it("explains when the pipeline never stored this edition in Supabase", async () => {
    editionRow = null;
    await expect(publishEditionToSupabase("2026-08-12", ["a1"])).rejects.toThrow(
      /STORAGE=supabase/
    );
  });

  it("does not publish anything when the withdraw step fails", async () => {
    failOn = "articles:update";
    await expect(publishEditionToSupabase("2026-08-12", ["a1"])).rejects.toBeInstanceOf(
      SupabasePublishError
    );
    const published = calls.find((c) => c.payload?.status === "published");
    expect(published).toBeUndefined();
  });
});
