import Link from "next/link";
import { logoutAction } from "./actions";

/**
 * Admin shell — a3-ui-ux.md §0 tokens reused, but denser (production-
 * readiness.md §2 / task instruction "운영자용으로 밀도 높게"): smaller
 * type scale, tighter spacing, no mobile-first tab bar — this is a desktop
 * work console, not the reader-facing app.
 *
 * The /admin/login page renders through this same layout (so the password
 * gate stays visually consistent), but the header/logout bar only appears
 * once a session exists — showing "로그아웃" pre-login would be confusing.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--color-surface-alt)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--sp-3) var(--sp-6)",
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <Link
          href="/admin"
          style={{
            fontWeight: 700,
            fontSize: "var(--fs-ui)",
            color: "var(--color-text)",
            textDecoration: "none",
          }}
        >
          BRIEFLY 검수 콘솔
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            style={{
              background: "transparent",
              border: "1px solid var(--color-border-strong)",
              borderRadius: "var(--r-sm)",
              padding: "6px var(--sp-3)",
              fontSize: "var(--fs-sm)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            로그아웃
          </button>
        </form>
      </header>
      <div style={{ padding: "var(--sp-6)" }}>{children}</div>
    </div>
  );
}
