/**
 * Server Actions are the console's write surface: every one of them changes a
 * file on disk, and the only thing standing between the open internet and
 * those files is the `requireAdminSession()` call at the top of each. These
 * tests hold that line — an unauthenticated call must not reach the
 * repository — and pin the input validation and error mapping around it.
 *
 * The repository and publish orchestration are mocked here on purpose; their
 * own file-level behaviour is covered in lib/admin/localFsEditionRepository
 * .test.ts and lib/admin/publishEdition.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so the spies it hands out have to be
// created up there with it.
const {
  revalidatePath,
  redirect,
  requireAdminSession,
  clearAdminSessionCookie,
  repo,
  publishEdition,
} = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => {
    // next/navigation's redirect never returns — it throws a control-flow error.
    throw new Error("NEXT_REDIRECT");
  }),
  requireAdminSession: vi.fn(async () => {}),
  clearAdminSessionCookie: vi.fn(async () => {}),
  repo: {
    setArticleDecision: vi.fn(async () => ({})),
    setLeadArticle: vi.fn(async () => {}),
    approveAllPending: vi.fn(async () => ({
      approved: 0,
      skipped: [] as Array<{ id: string; rankInEdition: number; reason: string }>,
    })),
  },
  publishEdition: vi.fn(async () => ({
    editionDate: "2026-07-13",
    publishedAt: "2026-07-14T00:00:00.000Z",
    approvedCount: 3,
    excludedCount: 1,
    warnings: ["주의 한 건"],
  })),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/admin/session", () => ({ requireAdminSession, clearAdminSessionCookie }));
vi.mock("@/lib/admin/localFsEditionRepository", () => ({ localFsEditionRepository: repo }));
vi.mock("@/lib/admin/publishEdition", async () => {
  class PublishError extends Error {}
  return { publishEdition, PublishError };
});

import {
  approveAllPendingAction,
  approveArticleAction,
  excludeArticleAction,
  logoutAction,
  publishEditionAction,
  resetArticleDecisionAction,
  setLeadArticleAction,
} from "./actions";
import { PublishError } from "@/lib/admin/publishEdition";

const DATE = "2026-07-13";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminSession.mockImplementation(async () => {});
});

describe("every write action checks the session before it writes", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["approveArticleAction", () => approveArticleAction(DATE, "art-1")],
    ["excludeArticleAction", () => excludeArticleAction(DATE, "art-1", "중복")],
    ["resetArticleDecisionAction", () => resetArticleDecisionAction(DATE, "art-1")],
    ["publishEditionAction", () => publishEditionAction(DATE)],
    ["setLeadArticleAction", () => setLeadArticleAction(DATE, "art-1")],
    ["approveAllPendingAction", () => approveAllPendingAction(DATE)],
  ];

  it.each(calls)("%s asks requireAdminSession", async (_name, call) => {
    await call();
    expect(requireAdminSession).toHaveBeenCalledTimes(1);
  });

  it.each(calls)("%s writes nothing when there is no session", async (_name, call) => {
    requireAdminSession.mockImplementation(async () => {
      throw new Error("관리자 세션이 없습니다. 다시 로그인해 주세요.");
    });

    await expect(call()).rejects.toThrow(/관리자 세션/);
    expect(repo.setArticleDecision).not.toHaveBeenCalled();
    expect(repo.setLeadArticle).not.toHaveBeenCalled();
    expect(repo.approveAllPending).not.toHaveBeenCalled();
    expect(publishEdition).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("approve / exclude / reset", () => {
  it("approveArticleAction records the decision and revalidates the console pages", async () => {
    expect(await approveArticleAction(DATE, "art-1")).toEqual({ ok: true });
    expect(repo.setArticleDecision).toHaveBeenCalledWith(DATE, "art-1", "approved");
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/${DATE}`);
    expect(revalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("turns a repository refusal into an error result instead of a crash", async () => {
    repo.setArticleDecision.mockRejectedValueOnce(new Error("Article art-1 is held"));
    expect(await approveArticleAction(DATE, "art-1")).toEqual({
      ok: false,
      error: "Article art-1 is held",
    });
    // A failed write must not tell the pages their data changed.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("excludeArticleAction demands a reason before touching the edition", async () => {
    expect(await excludeArticleAction(DATE, "art-1", "")).toEqual({
      ok: false,
      error: "제외 사유를 입력해 주세요.",
    });
    expect(await excludeArticleAction(DATE, "art-1", "   ")).toEqual({
      ok: false,
      error: "제외 사유를 입력해 주세요.",
    });
    expect(repo.setArticleDecision).not.toHaveBeenCalled();
  });

  it("excludeArticleAction passes the reason through", async () => {
    expect(await excludeArticleAction(DATE, "art-1", "중복 기사")).toEqual({ ok: true });
    expect(repo.setArticleDecision).toHaveBeenCalledWith(DATE, "art-1", "excluded", "중복 기사");
  });

  it("resetArticleDecisionAction puts the article back to pending", async () => {
    expect(await resetArticleDecisionAction(DATE, "art-1")).toEqual({ ok: true });
    expect(repo.setArticleDecision).toHaveBeenCalledWith(DATE, "art-1", "pending");
  });
});

describe("publishEditionAction", () => {
  it("reports the counts and warnings, and revalidates the public pages too", async () => {
    const result = await publishEditionAction(DATE);
    expect(result).toEqual({
      ok: true,
      approvedCount: 3,
      warnings: ["주의 한 건"],
      // No supabase result on this publish, so it did not reach readers.
      reachedReaders: false,
      publishedCount: undefined,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/archive");
  });

  it("only claims readers saw it when Supabase says how many", async () => {
    publishEdition.mockResolvedValueOnce({
      editionDate: DATE,
      publishedAt: "2026-08-12T00:00:00Z",
      approvedCount: 3,
      excludedCount: 0,
      warnings: [],
      supabase: { publishedCount: 3, withdrawnCount: 1 },
    });
    const result = await publishEditionAction(DATE);
    expect(result.reachedReaders).toBe(true);
    expect(result.publishedCount).toBe(3);
  });

  it("returns a PublishError's message to the operator", async () => {
    publishEdition.mockRejectedValueOnce(new PublishError("승인된 기사가 없습니다."));
    expect(await publishEditionAction(DATE)).toEqual({
      ok: false,
      error: "승인된 기사가 없습니다.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns any other failure's message rather than swallowing it", async () => {
    publishEdition.mockRejectedValueOnce(new Error("EACCES: permission denied"));
    expect(await publishEditionAction(DATE)).toEqual({
      ok: false,
      error: "EACCES: permission denied",
    });
  });
});

describe("setLeadArticleAction", () => {
  it("sets the front-page article", async () => {
    expect(await setLeadArticleAction(DATE, "art-4")).toEqual({ ok: true });
    expect(repo.setLeadArticle).toHaveBeenCalledWith(DATE, "art-4");
  });

  it("clears the override with null", async () => {
    expect(await setLeadArticleAction(DATE, null)).toEqual({ ok: true });
    expect(repo.setLeadArticle).toHaveBeenCalledWith(DATE, null);
  });

  it("surfaces the guard that keeps a held article off the front page", async () => {
    repo.setLeadArticle.mockRejectedValueOnce(
      new Error("보류(held) 상태인 기사는 1면으로 지정할 수 없습니다.")
    );
    const result = await setLeadArticleAction(DATE, "art-held");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/1면/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("approveAllPendingAction", () => {
  it("passes back what was approved and what was deliberately skipped", async () => {
    repo.approveAllPending.mockResolvedValueOnce({
      approved: 2,
      skipped: [{ id: "art-9", rankInEdition: 9, reason: "이미 제외함" }],
    });
    expect(await approveAllPendingAction(DATE)).toEqual({
      ok: true,
      approved: 2,
      skipped: [{ id: "art-9", rankInEdition: 9, reason: "이미 제외함" }],
    });
  });

  it("turns a failure into an error result", async () => {
    repo.approveAllPending.mockRejectedValueOnce(new Error("Edition not found: 2099-01-01"));
    expect(await approveAllPendingAction("2099-01-01")).toEqual({
      ok: false,
      error: "Edition not found: 2099-01-01",
    });
  });
});

describe("logoutAction", () => {
  it("clears the session cookie before sending the operator to the login page", async () => {
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT");
    expect(clearAdminSessionCookie).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/admin/login");
    expect(clearAdminSessionCookie.mock.invocationCallOrder[0]).toBeLessThan(
      redirect.mock.invocationCallOrder[0]
    );
  });
});
