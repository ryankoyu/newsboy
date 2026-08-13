import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SyncableState } from "@/lib/session";

/**
 * What these guard is the failure direction. A sync that works is pleasant;
 * a sync that loses a reader's vocabulary is the reason people stop trusting
 * an app, and it happens on the paths nobody demos — an empty server, a
 * refused write, a network error halfway through.
 */

const localState: SyncableState = {
  level: "B1",
  onboarded: true,
  bookmarks: ["d3c460da-931f-4a1f-b19f-b3ed9406bed9"],
  readArticles: ["d3c460da-931f-4a1f-b19f-b3ed9406bed9"],
  readEvents: [{ articleId: "d3c460da-931f-4a1f-b19f-b3ed9406bed9", readAt: "2026-08-01T00:00:00Z" }],
  savedWords: [{ term: "ferry", meaning_ko: "여객선", savedAt: "2026-08-01T00:00:00Z" }],
  savedSentences: [],
};

const readSyncableState = vi.fn(() => structuredClone(localState));
const applySyncedState = vi.fn(() => true);

vi.mock("@/lib/session", () => ({ readSyncableState, applySyncedState }));

const { syncSession } = await import("@/lib/sync/syncSession");

/** Minimal PostgREST stand-in: per-table select data, and recorded upserts. */
function makeDb(opts: {
  select?: Record<string, unknown>;
  selectError?: Record<string, string>;
  upsertError?: Record<string, string>;
}) {
  const upserts: Record<string, unknown[]> = {};
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () =>
          opts.selectError?.[table]
            ? { data: null, error: { message: opts.selectError[table] } }
            : { data: opts.select?.[table] ?? null, error: null },
        upsert: async (rows: unknown[]) => {
          upserts[table] = (upserts[table] ?? []).concat(rows);
          return opts.upsertError?.[table]
            ? { error: { message: opts.upsertError[table] } }
            : { error: null };
        },
      };
      (chain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) =>
        resolve(
          opts.selectError?.[table]
            ? { data: null, error: { message: opts.selectError[table] } }
            : { data: opts.select?.[table] ?? [], error: null }
        );
      return chain;
    },
  };
  return { db: db as never, upserts };
}

beforeEach(() => {
  readSyncableState.mockClear();
  applySyncedState.mockClear();
  applySyncedState.mockReturnValue(true);
});

describe("syncSession", () => {
  it("keeps every local word when the server has none", async () => {
    // A first sign-in on the reader's only device: the server is empty and
    // must not be mistaken for "you have no saved words".
    const { db } = makeDb({ select: {} });
    const result = await syncSession(db, "user-1");

    expect(result.ok).toBe(true);
    const written = applySyncedState.mock.calls[0][0] as SyncableState;
    expect(written.savedWords.map((w) => w.term)).toEqual(["ferry"]);
  });

  it("unions the server's words with this device's", async () => {
    const { db } = makeDb({
      select: {
        saved_words: [{ term: "quake", meaning_ko: "지진", created_at: "2026-07-01T00:00:00Z" }],
      },
    });
    await syncSession(db, "user-1");

    const written = applySyncedState.mock.calls[0][0] as SyncableState;
    expect(written.savedWords.map((w) => w.term).sort()).toEqual(["ferry", "quake"]);
  });

  it("does not touch this device when the server read fails", async () => {
    const { db } = makeDb({ selectError: { saved_words: "network down" } });
    const result = await syncSession(db, "user-1");

    expect(result.ok).toBe(false);
    expect(applySyncedState).not.toHaveBeenCalled();
  });

  it("reports failure — and does not claim success — when the local write is refused", async () => {
    applySyncedState.mockReturnValue(false);
    const { db } = makeDb({ select: {} });
    const result = await syncSession(db, "user-1");

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/저장하지 못했습니다/);
  });

  it("still keeps what it downloaded when the upload fails", async () => {
    // Download-then-upload ordering: a reader who signs in on a new phone
    // gets their words even if the push then fails.
    const { db } = makeDb({
      select: {
        saved_words: [{ term: "quake", meaning_ko: "지진", created_at: "2026-07-01T00:00:00Z" }],
      },
      upsertError: { saved_words: "insert denied" },
    });
    const result = await syncSession(db, "user-1");

    expect(result.ok).toBe(false);
    expect(applySyncedState).toHaveBeenCalled();
    const written = applySyncedState.mock.calls[0][0] as SyncableState;
    expect(written.savedWords.map((w) => w.term).sort()).toEqual(["ferry", "quake"]);
    expect(result.message).toMatch(/그대로입니다/);
  });

  it("keeps the level this reader chose over the server's", async () => {
    const { db } = makeDb({ select: { profiles: { level: "A2" } } });
    await syncSession(db, "user-1");

    const written = applySyncedState.mock.calls[0][0] as SyncableState;
    expect(written.level).toBe("B1");
  });

  it("skips seed article ids rather than failing the whole push on a foreign key", async () => {
    readSyncableState.mockReturnValueOnce({
      ...structuredClone(localState),
      bookmarks: ["article-2026-07-13-4", "d3c460da-931f-4a1f-b19f-b3ed9406bed9"],
    });
    const { db, upserts } = makeDb({ select: {} });
    const result = await syncSession(db, "user-1");

    expect(result.ok).toBe(true);
    const pushed = (upserts.bookmarks ?? []) as { article_id: string }[];
    expect(pushed.map((b) => b.article_id)).toEqual(["d3c460da-931f-4a1f-b19f-b3ed9406bed9"]);
    // Kept locally — skipping the upload must not delete the bookmark.
    const written = applySyncedState.mock.calls[0][0] as SyncableState;
    expect(written.bookmarks).toContain("article-2026-07-13-4");
    expect(result.skippedArticleRefs).toBeGreaterThan(0);
  });

  it("does not invent a read timestamp for an article that never had one", async () => {
    readSyncableState.mockReturnValueOnce({
      ...structuredClone(localState),
      readEvents: [],
    });
    const { db, upserts } = makeDb({ select: {} });
    await syncSession(db, "user-1");

    const rows = (upserts.reading_progress ?? []) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].read_at).toBeUndefined();
  });

  it("turns a thrown error into a message instead of crashing the screen", async () => {
    const db = {
      from() {
        throw new Error("boom");
      },
    } as never;
    const result = await syncSession(db, "user-1");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/boom/);
  });
});
