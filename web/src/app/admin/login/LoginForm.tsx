"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form
      action={action}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-3)",
        width: "100%",
        maxWidth: 320,
      }}
    >
      <input type="hidden" name="from" value={from} />
      <label
        htmlFor="admin-password"
        style={{ fontFamily: "var(--font-ui)", fontSize: "var(--fs-sm)", color: "var(--color-text-secondary)" }}
      >
        운영자 비밀번호
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoFocus
        required
        style={{
          height: 44,
          padding: "0 var(--sp-3)",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--color-border-strong)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
        }}
      />
      {state.error && (
        <p style={{ color: "var(--color-danger)", fontSize: "var(--fs-sm)", fontFamily: "var(--font-ui)", margin: 0 }}>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        style={{
          height: 44,
          borderRadius: "var(--r-sm)",
          border: "none",
          background: "var(--color-accent)",
          color: "var(--color-text-invert)",
          fontFamily: "var(--font-ui)",
          fontWeight: 600,
          cursor: pending ? "not-allowed" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "확인 중…" : "로그인"}
      </button>
    </form>
  );
}
