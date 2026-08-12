import { describe, it, expect, vi, beforeEach } from "vitest";

const getLatestEdition = vi.fn();

vi.mock("@/lib/data", () => ({ dataProvider: { getLatestEdition } }));

const { getLatestEditionOrNull } = await import("@/lib/data/resilient");

beforeEach(() => {
  getLatestEdition.mockReset();
});

describe("getLatestEditionOrNull", () => {
  it("passes the edition through when the read succeeds", async () => {
    const edition = { id: "e1", edition_date: "2026-08-12", articles: [] };
    getLatestEdition.mockResolvedValueOnce(edition);
    expect(await getLatestEditionOrNull()).toBe(edition);
  });

  it("returns null instead of throwing when the database is unreachable", async () => {
    // The seed could never fail; a live query can. Uncaught, this is a 500
    // on the front page of a news site.
    getLatestEdition.mockRejectedValueOnce(new Error("fetch failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getLatestEditionOrNull()).toBeNull();
    // Logged, not swallowed — "nothing published" and "database down" render
    // identically, so the operator's only signal is this line.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("passes null through — no edition published is not an error", async () => {
    getLatestEdition.mockResolvedValueOnce(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getLatestEditionOrNull()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
