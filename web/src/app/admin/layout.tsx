import Link from "next/link";
import { logoutAction } from "./actions";
import { checkAdminAvailability } from "@/lib/admin/availability";

/**
 * Admin shell — a3-ui-ux.md §0 tokens reused, but denser (production-
 * readiness.md §2 / task instruction "운영자용으로 밀도 높게"): smaller
 * type scale, tighter spacing, no mobile-first tab bar — this is a desktop
 * work console, not the reader-facing app.
 *
 * The /admin/login page renders through this same layout (so the password
 * gate stays visually consistent), but the header/logout bar only appears
 * once a session exists — showing "로그아웃" pre-login would be confusing.
 *
 * Availability gate (deploy-readiness task, 2026-08-10): checked here, above
 * every /admin/** page (including /admin/login), so no child page ever
 * touches the local-fs repository when it isn't there — one check point
 * instead of scattering try/catch across pages. See lib/admin/availability.ts.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const availability = await checkAdminAvailability();
  if (!availability.available) {
    return <AdminUnavailableNotice reason={availability.reason} />;
  }

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

/**
 * Rendered instead of any /admin/** page when the console can't function —
 * missing pipeline/output repository (not yet connected / Vercel deploy
 * with no local fs data) or an explicit ADMIN_ENABLED=false. Never a 500:
 * this is the deploy-safe fallback screen (task instruction, 2026-08-10).
 */
function AdminUnavailableNotice({ reason }: { reason?: "disabled" | "no-repository" }) {
  const message =
    reason === "disabled"
      ? "ADMIN_ENABLED=false로 이 환경에서는 검수 콘솔이 꺼져 있습니다."
      : "검수 콘솔은 Supabase 연결 후 사용 가능합니다.";
  const detail =
    reason === "disabled"
      ? "검수 콘솔을 다시 켜려면 이 환경의 ADMIN_ENABLED 환경변수를 지우거나 true로 바꾸세요."
      : "현재 검수 콘솔은 파이프라인이 로컬에 남긴 파일(pipeline/output/editions/*.json)을 직접 읽습니다. 이 서버에는 그 파일이 없어(예: Vercel 배포본) 검수할 내용을 찾을 수 없습니다. Supabase 연결 및 웹 어댑터 전환 후 다시 사용할 수 있습니다.";

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-3)",
        background: "var(--color-bg)",
        padding: "var(--sp-6)",
        fontFamily: "var(--font-ui)",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--color-text)", margin: 0 }}>
        BRIEFLY 검수 콘솔
      </h1>
      <p style={{ fontSize: "var(--fs-ui)", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
        {message}
      </p>
      <p
        style={{
          fontSize: "var(--fs-sm)",
          color: "var(--color-text-muted)",
          margin: 0,
          maxWidth: "36rem",
          lineHeight: 1.6,
        }}
      >
        {detail}
      </p>
    </div>
  );
}
