"use client";

import Link from "next/link";
import { useSession } from "@/lib/useSession";

/**
 * Non-intrusive home banner nudging level self-diagnosis — design-decisions.md
 * §4.6 QA-driven policy: "온보딩은 강제하지 않는다. 홈 즉시 열람, 레벨 미설정 시
 * 홈 상단 배너로 레벨 진단 유도, 기본 레벨 A2."
 *
 * Shown only while the user hasn't completed onboarding AND hasn't dismissed
 * the banner. Completing onboarding (OnboardingFlow.finish/skipAll) or
 * clicking the dismiss (X) button both hide it permanently for this device.
 */
export function OnboardingBanner() {
  const { session, refresh, hydrated } = useSession();

  if (!hydrated) return null;
  if (session.hasOnboarded() || session.hasDismissedOnboardingBanner()) return null;

  function handleDismiss() {
    session.dismissOnboardingBanner();
    refresh();
  }

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--sp-3)",
        background: "var(--color-accent-soft)",
        border: "1px solid var(--color-accent)",
        borderRadius: "var(--r-md)",
        padding: "var(--sp-3) var(--sp-4)",
        marginBottom: "var(--sp-5)",
      }}
    >
      <Link
        href="/onboarding"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          fontWeight: 600,
          color: "var(--color-text)",
          textDecoration: "none",
        }}
      >
        <span aria-hidden>📊</span>
        <span>1분 레벨 진단하기</span>
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="배너 닫기"
        style={{
          background: "transparent",
          border: "none",
          fontSize: 18,
          lineHeight: 1,
          color: "var(--color-text-secondary)",
          padding: "var(--sp-2)",
          cursor: "pointer",
        }}
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}
