"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getAuthClient } from "@/lib/auth/client";
import { syncSession } from "@/lib/sync/syncSession";
import { clearLocalSession } from "@/lib/session";
import { notifySessionChange } from "@/lib/useSession";

/**
 * Sign in, and back up this device's record.
 *
 * Signing in is optional and always will be — reading is the product, an
 * account is insurance. Everything works signed out; what an account buys is
 * that a lost phone does not cost the reader their vocabulary.
 *
 * Email link rather than a password: there is no password to store, forget,
 * or leak, and it needs nothing set up beyond Supabase itself. Kakao or
 * Google can be added later without touching the sync layer.
 */
export function AccountSection() {
  const client = getAuthClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Deletion is two steps on purpose: the confirm box only appears after the
  // reader asks for it, and the button inside it is the only thing that acts.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    // No client means no sign-in at all, and the render below returns before
    // `ready` is ever read — so there is nothing to set here.
    if (!client) return;
    let alive = true;
    client.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [client]);

  if (!client) {
    return (
      <Panel>
        <p style={muted}>
          이 사이트는 계정 없이 동작합니다. 저장한 단어와 읽은 기록은 이 브라우저에만
          남습니다 — 아래 &ldquo;내보내기&rdquo;로 백업해 두세요.
        </p>
      </Panel>
    );
  }

  if (!ready) return <Panel><p style={muted}>확인 중…</p></Panel>;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/settings` },
    });
    setBusy(false);
    if (err) setError(`로그인 링크를 보내지 못했습니다: ${err.message}`);
    else setMessage(`${email} 로 로그인 링크를 보냈습니다. 메일함을 확인해 주세요.`);
  }

  async function runSync() {
    if (!client || !session) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await syncSession(client, session.user.id);
    setBusy(false);
    if (result.ok) {
      // The screens reading this store need to hear about the merge.
      notifySessionChange();
      setMessage(
        result.skippedArticleRefs
          ? `${result.message} (예시 기사 ${result.skippedArticleRefs}건의 기록은 이 기기에만 남습니다)`
          : result.message
      );
    } else {
      setError(result.message);
    }
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    // Local data is deliberately untouched: signing out is not "forget me".
    setMessage("로그아웃했습니다. 이 기기의 기록은 그대로 있습니다.");
  }

  /**
   * Deletes the account and everything attached to it.
   *
   * One RPC, not a series of deletes: delete_own_account() (0008) removes the
   * auth user, and every table holding the reader's rows cascades from it —
   * profiles, reading progress, saved words, bookmarks, saved sentences. A
   * client-side sweep would be a list that silently falls behind the schema.
   *
   * The local copy goes too. Signing out leaves it alone by design, but
   * deleting an account is a request to be forgotten, and honouring only the
   * server half of that would leave the reader's words on the screen in front
   * of them.
   */
  async function deleteAccount() {
    if (!client) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await client.rpc("delete_own_account");
    if (err) {
      setBusy(false);
      setError(`계정을 삭제하지 못했습니다: ${err.message}`);
      return;
    }
    clearLocalSession();
    await client.auth.signOut();
    setBusy(false);
    setConfirmingDelete(false);
    notifySessionChange();
    setMessage("계정과 저장한 기록을 모두 삭제했습니다.");
  }

  return (
    <Panel>
      {session ? (
        <>
          <p style={{ ...muted, marginBottom: "var(--sp-3)" }}>
            <strong style={{ color: "var(--color-text)" }}>{session.user.email}</strong> 로
            로그인되어 있습니다.
          </p>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <button type="button" onClick={runSync} disabled={busy} style={primaryBtn}>
              {busy ? "동기화 중…" : "지금 동기화"}
            </button>
            <button type="button" onClick={signOut} disabled={busy} style={plainBtn}>
              로그아웃
            </button>
          </div>

          {confirmingDelete ? (
            <div
              style={{
                marginTop: "var(--sp-4)",
                padding: "var(--sp-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--r-md)",
              }}
            >
              <p style={{ ...muted, margin: "0 0 var(--sp-3)" }}>
                계정과 함께 저장한 단어·문장·북마크·읽은 기록이 모두 삭제됩니다. 되돌릴 수
                없습니다. 남겨두고 싶은 것이 있다면 먼저 내보내기로 백업하세요.
              </p>
              <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
                <button type="button" onClick={deleteAccount} disabled={busy} style={plainBtn}>
                  {busy ? "삭제 중…" : "네, 삭제합니다"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={busy}
                  style={plainBtn}
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
              style={{ ...plainBtn, marginTop: "var(--sp-4)" }}
            >
              회원 탈퇴
            </button>
          )}
          <p style={{ ...muted, marginTop: "var(--sp-3)", fontSize: "var(--fs-sm)" }}>
            저장한 단어·북마크·읽은 기록이 동기화됩니다. 저장한 문장은 아직 이 기기에만
            남습니다.
          </p>
        </>
      ) : (
        <form onSubmit={sendLink}>
          <p style={{ ...muted, marginBottom: "var(--sp-3)" }}>
            로그인하면 저장한 단어와 읽은 기록이 기기 사이에서 이어집니다. 로그인하지 않아도
            읽는 데는 아무 지장이 없습니다.
          </p>
          <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              aria-label="이메일 주소"
              style={input}
            />
            <button type="submit" disabled={busy || !email} style={primaryBtn}>
              {busy ? "보내는 중…" : "로그인 링크 받기"}
            </button>
          </div>
        </form>
      )}

      {message && <p style={{ ...muted, color: "var(--color-success)", marginTop: "var(--sp-3)" }}>{message}</p>}
      {error && <p style={{ ...muted, color: "var(--color-danger)", marginTop: "var(--sp-3)" }}>{error}</p>}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-md)",
        padding: "var(--sp-4)",
      }}
    >
      <h2
        style={{
          margin: "0 0 var(--sp-3)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h3)",
          color: "var(--color-text)",
        }}
      >
        계정
      </h2>
      {children}
    </section>
  );
}

const muted: React.CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-ui)",
  fontSize: "var(--fs-ui)",
  color: "var(--color-text-muted)",
  lineHeight: 1.6,
};

const input: React.CSSProperties = {
  flex: "1 1 12rem",
  padding: "var(--sp-2) var(--sp-3)",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--fs-ui)",
  color: "var(--color-text)",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--r-sm)",
};

const primaryBtn: React.CSSProperties = {
  padding: "var(--sp-2) var(--sp-4)",
  fontFamily: "var(--font-ui)",
  fontSize: "var(--fs-ui)",
  color: "var(--color-bg)",
  background: "var(--color-accent)",
  border: "none",
  borderRadius: "var(--r-sm)",
  cursor: "pointer",
};

const plainBtn: React.CSSProperties = {
  ...primaryBtn,
  color: "var(--color-text)",
  background: "transparent",
  border: "1px solid var(--color-border)",
};
