import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The desk, working against the database instead of one laptop's filesystem.
 *
 * Two things are worth pinning here, and they are different in kind.
 *
 * The mapping: the console renders gate badges, provenance, and three levels
 * of body from what this returns, so a row shape that arrives subtly wrong
 * produces a review screen that looks complete and is not. That is the failure
 * mode the pipeline's own getEdition() has today — it returns articles with no
 * versions at all.
 *
 * The rules: this repository must refuse exactly what the local one refuses.
 * They now share reviewRules.ts precisely so they cannot diverge, and these
 * tests check the sharing actually holds through this implementation — a
 * deployed console that approves a gate-held article is the worst version of
 * this bug, because it is the one an operator would trust.
 *
 * What they cannot prove is that the queries match the real schema. A fake
 * client accepts any table and any column; the migration is checked against a
 * real Postgres in pipeline/src/storage/supabase.integration.test.ts.
 */

interface Captured {
  table: string;
  patch: Record<string, unknown>;
  ids: string[];
}

const rows: Record<string, unknown> = {};
const updates: Captured[] = [];

vi.mock("@supabase/supabase-js", () => {
  function builder(table: string) {
    const captured: Captured = { table, patch: {}, ids: [] };
    const chain = {
      select: () => chain,
      update: (patch: Record<string, unknown>) => {
        captured.patch = patch;
        updates.push(captured);
        return chain;
      },
      eq: (_col: string, value: string) => {
        captured.ids.push(value);
        return chain;
      },
      in: (_col: string, values: string[]) => {
        captured.ids.push(...values);
        return chain;
      },
      order: () => chain,
      maybeSingle: async () => ({ data: rows[`${table}:single`] ?? null, error: null }),
      then: undefined as unknown,
    };
    (chain as unknown as PromiseLike<unknown>).then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows[table] ?? [], error: null });
    return chain;
  }
  return { createClient: () => ({ from: (table: string) => builder(table) }) };
});

const { SupabaseEditionRepository } = await import("@/lib/admin/supabaseEditionRepository");

const repo = new SupabaseEditionRepository("https://example.supabase.co", "service-role-key");

/** One article, gate-clean unless a failing check is passed in. */
function article(overrides: Record<string, unknown> = {}, checkPassed = true) {
  return {
    id: "art-1",
    slug: "a-story",
    event_summary: "An event",
    rank_in_edition: 1,
    status: "review",
    created_at: "2026-08-16T00:00:00Z",
    category_id: 1,
    review_decision: "pending",
    exclude_reason: null,
    regenerate_note: null,
    regenerate_requested_at: null,
    regeneration_count: 0,
    regenerated_at: null,
    sources: [{ url: "https://e.com/1", outlet: "BBC", title: "Orig", fetch_method: "rss_summary" }],
    facts: [{ statement: "A fact.", source_count: 2, used_in_text: true, note: null }],
    article_versions: [
      {
        level: "B1",
        title: "Mid",
        content: "Body two.",
        word_count: 2,
        words: [
          { term: "b", meaning_ko: "비", example: "e", pronunciation: "p", sort_order: 2, is_key: false, pos: "n." },
          { term: "a", meaning_ko: "에이", example: "e", pronunciation: "p", sort_order: 1, is_key: true, pos: "v." },
        ],
        quality_checks: [{ kind: "two_source", score: null, passed: checkPassed, detail: {} }],
      },
      {
        level: "A2",
        title: "Easy",
        content: "Body one.",
        word_count: 2,
        words: [],
        quality_checks: [{ kind: "cefr", score: 1, passed: true, detail: {} }],
      },
    ],
    ...overrides,
  };
}

function edition(articles: unknown[] = [article()], overrides: Record<string, unknown> = {}) {
  return {
    id: "ed-1",
    edition_date: "2026-08-12",
    status: "draft",
    published_at: null,
    lead_article_id: null,
    articles,
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(rows)) delete rows[k];
  updates.length = 0;
});

describe("SupabaseEditionRepository — reading", () => {
  it("returns the three levels in reading order, not the order the rows arrived", async () => {
    rows["editions:single"] = edition();
    const result = await repo.getEdition("2026-08-12");
    expect(result?.articles[0].versions.map((v) => v.version.level)).toEqual(["A2", "B1"]);
  });

  it("carries the gate checks the review badges are drawn from", async () => {
    rows["editions:single"] = edition();
    const result = await repo.getEdition("2026-08-12");
    const b1 = result!.articles[0].versions.find((v) => v.version.level === "B1")!;
    expect(b1.checks[0]).toMatchObject({ kind: "two_source", level: "B1", passed: true });
    expect(b1.passed).toBe(true);
  });

  it("marks a version failed when any of its checks failed", async () => {
    rows["editions:single"] = edition([article({}, false)]);
    const result = await repo.getEdition("2026-08-12");
    const b1 = result!.articles[0].versions.find((v) => v.version.level === "B1")!;
    expect(b1.passed).toBe(false);
  });

  it("sorts a version's words by sort_order", async () => {
    rows["editions:single"] = edition();
    const result = await repo.getEdition("2026-08-12");
    const b1 = result!.articles[0].versions.find((v) => v.version.level === "B1")!;
    expect(b1.version.words.map((w) => w.term)).toEqual(["a", "b"]);
    expect(b1.version.words[0].isKey).toBe(true);
  });

  it("carries sources and facts for the provenance panel", async () => {
    rows["editions:single"] = edition();
    const result = await repo.getEdition("2026-08-12");
    expect(result!.articles[0].sources[0].outlet).toBe("BBC");
    expect(result!.articles[0].facts[0]).toMatchObject({ sourceCount: 2, usedInText: true });
  });

  it("returns null for a date with no edition rather than an empty one", async () => {
    expect(await repo.getEdition("2999-01-01")).toBeNull();
  });

  it("counts decisions for the edition list", async () => {
    rows["editions"] = [
      edition([
        article({ id: "a1", review_decision: "approved" }),
        article({ id: "a2", review_decision: "excluded", exclude_reason: "중복" }),
        article({ id: "a3", review_decision: "pending" }),
        article({ id: "a4", review_decision: "pending" }, false),
      ]),
    ];
    const [item] = await repo.listEditions();
    expect(item).toMatchObject({
      articleCount: 4,
      approvedCount: 1,
      excludedCount: 1,
      pendingCount: 2,
      heldCount: 1,
    });
  });
});

describe("SupabaseEditionRepository — the rules it must not relax", () => {
  it("refuses to approve a gate-held article", async () => {
    rows["editions:single"] = edition([article({}, false)]);
    await expect(repo.setArticleDecision("2026-08-12", "art-1", "approved")).rejects.toThrow(/held/);
    expect(updates).toHaveLength(0);
  });

  it("refuses an exclusion with no reason", async () => {
    rows["editions:single"] = edition();
    await expect(repo.setArticleDecision("2026-08-12", "art-1", "excluded", "  ")).rejects.toThrow(
      /excludeReason/,
    );
  });

  it("refuses a rewrite request with no note — the note is the instruction", async () => {
    rows["editions:single"] = edition();
    await expect(repo.setArticleDecision("2026-08-12", "art-1", "regenerate", "")).rejects.toThrow(
      /regenerateNote/,
    );
  });

  it("allows a rewrite request on a held article — its only way forward", async () => {
    rows["editions:single"] = edition([article({}, false)]);
    await repo.setArticleDecision("2026-08-12", "art-1", "regenerate", "출처 보강 필요");
    expect(updates[0].patch).toMatchObject({
      review_decision: "regenerate",
      regenerate_note: "출처 보강 필요",
    });
    expect(updates[0].patch.regenerate_requested_at).toBeTruthy();
  });

  it("clears the outstanding request but keeps the note as history", async () => {
    rows["editions:single"] = edition([
      article({ review_decision: "regenerate", regenerate_note: "이전 지시", regenerate_requested_at: "2026-08-15T00:00:00Z" }),
    ]);
    await repo.setArticleDecision("2026-08-12", "art-1", "approved");
    expect(updates[0].patch).toMatchObject({
      review_decision: "approved",
      regenerate_requested_at: null,
      regenerate_note: "이전 지시",
    });
  });

  it("skips excluded, sent-back and held articles in a bulk approve", async () => {
    rows["editions:single"] = edition([
      article({ id: "a1" }),
      article({ id: "a2", review_decision: "excluded", exclude_reason: "중복" }),
      article({ id: "a3", review_decision: "regenerate", regenerate_note: "다시" }),
      article({ id: "a4" }, false),
    ]);
    const result = await repo.approveAllPending("2026-08-12");
    expect(result.approved).toBe(1);
    expect(result.skipped.map((s) => s.reason).sort()).toEqual([
      "보류(held) — 게이트 미통과",
      "이미 제외함",
      "재생성 요청 대기 중",
    ]);
    // Only the one approvable article is written.
    expect(updates[0].ids).toEqual(["a1"]);
  });

  it("makes no write at all when a bulk approve has nothing to approve", async () => {
    rows["editions:single"] = edition([article({ review_decision: "approved" })]);
    const result = await repo.approveAllPending("2026-08-12");
    expect(result.approved).toBe(0);
    expect(updates).toHaveLength(0);
  });

  it("refuses to put an excluded article on the front page", async () => {
    rows["editions:single"] = edition([
      article({ review_decision: "excluded", exclude_reason: "중복" }),
    ]);
    await expect(repo.setLeadArticle("2026-08-12", "art-1")).rejects.toThrow(/제외/);
  });

  it("clears the front-page override without checking anything", async () => {
    rows["editions:single"] = edition();
    await repo.setLeadArticle("2026-08-12", null);
    expect(updates[0].patch).toEqual({ lead_article_id: null });
  });

  it("stamps published_at on publish and clears it on revert", async () => {
    rows["editions:single"] = edition();
    await repo.setEditionStatus("2026-08-12", "published");
    expect(updates[0].patch.status).toBe("published");
    expect(updates[0].patch.published_at).toBeTruthy();

    updates.length = 0;
    await repo.setEditionStatus("2026-08-12", "draft");
    expect(updates[0].patch).toMatchObject({ status: "draft", published_at: null });
  });
});
