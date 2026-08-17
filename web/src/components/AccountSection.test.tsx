import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

/**
 * 회원 탈퇴.
 *
 * The account had no exit. Signing in worked, rows accumulated across five
 * tables, and lib/sync/merge.ts said outright that deletion was "not a thing
 * this module can express" — so the only way out was to ask someone. That is
 * the gap docs/legal/questions-for-counsel.md B-2 names, and it is the kind
 * that has to be right the first time: a reader who asks to be forgotten and
 * is told they were, while their words sit in localStorage, has been lied to.
 *
 * So these pin the three things that make the button trustworthy — it does not
 * fire without a second confirmation, it wipes the local copy as well as the
 * server's, and a failure says so instead of claiming success.
 */

const rpc = vi.fn();
const signOut = vi.fn();
const STORAGE_KEY = "briefly:session:v1";

vi.mock("@/lib/auth/client", () => ({
  getAuthClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: "u1", email: "reader@example.com" } } },
      }),
      // Shape matters: the component reads `data.subscription`.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut,
      signInWithOtp: vi.fn(),
    },
    rpc,
  }),
  isAuthConfigured: () => true,
}));

const { AccountSection } = await import("@/components/AccountSection");

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  // The real store, not a mock: what matters is that the reader's words are
  // actually gone from this browser, not that a function was called.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedWords: [{ term: "ferry" }] }));
});

afterEach(cleanup);

async function renderSignedIn() {
  render(<AccountSection />);
  await screen.findByText(/reader@example.com/);
}

describe("AccountSection — 회원 탈퇴", () => {
  it("does not delete anything when the button is merely pressed", async () => {
    await renderSignedIn();
    fireEvent.click(screen.getByText("회원 탈퇴"));
    expect(rpc).not.toHaveBeenCalled();
    // It asks first, and says what is about to be lost.
    expect(screen.getByText(/되돌릴 수\s*없습니다/)).toBeInTheDocument();
  });

  it("can be backed out of", async () => {
    await renderSignedIn();
    fireEvent.click(screen.getByText("회원 탈퇴"));
    fireEvent.click(screen.getByText("취소"));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByText("회원 탈퇴")).toBeInTheDocument();
  });

  it("deletes the account through the one function that can, then clears this device", async () => {
    await renderSignedIn();
    fireEvent.click(screen.getByText("회원 탈퇴"));
    fireEvent.click(screen.getByText("네, 삭제합니다"));

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("delete_own_account"));
    // The local copy is the half a server-side delete cannot reach.
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull());
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(await screen.findByText(/모두 삭제했습니다/)).toBeInTheDocument();
  });

  it("says a failed deletion failed, and keeps the local data", async () => {
    rpc.mockResolvedValue({ error: { message: "not authenticated" } });
    await renderSignedIn();
    fireEvent.click(screen.getByText("회원 탈퇴"));
    fireEvent.click(screen.getByText("네, 삭제합니다"));

    expect(await screen.findByText(/삭제하지 못했습니다/)).toBeInTheDocument();
    // Wiping this device after a server-side failure would destroy the only
    // remaining copy of a record the account still holds.
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });
});
