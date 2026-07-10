"use client";

import type { EditionWithArticles, CefrLevel } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { useSession } from "@/lib/useSession";
import { GreetingBlock } from "@/components/GreetingBlock";
import { CategorySummaryChips } from "@/components/CategorySummaryChips";
import { ArticleCard } from "@/components/ArticleCard";
import { ArticleCardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { OnboardingBanner } from "@/components/OnboardingBanner";

const TOP_N = 10;

/**
 * Home is immediately viewable, no forced onboarding redirect — policy
 * confirmed in design-decisions.md §4.6 (Q1/Q2 QA): "온보딩은 강제하지
 * 않는다. 홈 즉시 열람, 레벨 미설정 시 홈 상단 배너로 레벨 진단 유도,
 * 기본 레벨 A2." OnboardingBanner (non-intrusive, dismissible) handles the
 * nudge; session.getLevel() already defaults to "A2" (session.ts DEFAULTS).
 */
export function HomeView({ edition }: { edition: EditionWithArticles | null }) {
  const { session, hydrated } = useSession();

  if (!hydrated) {
    // Avoid a content flash before client-side session state hydrates.
    return (
      <main
        style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "var(--sp-4)" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <ArticleCardSkeleton key={i} />
          ))}
        </div>
      </main>
    );
  }

  if (!edition || edition.articles.length === 0) {
    return (
      <main style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "var(--sp-4)" }}>
        <OnboardingBanner />
        <EmptyState
          emoji="☕"
          title="오늘의 브리핑을 준비하고 있어요."
          description="보통 아침 8시경 도착해요."
        />
      </main>
    );
  }

  const level = session.getLevel();
  const articles = edition.articles.slice(0, TOP_N);
  const totalMinutes = articles.reduce((sum, a) => {
    const v = a.versions.find((v) => v.level === level) ?? a.versions[0];
    if (!v) return sum;
    return sum + estimateReadingMinutes(v.level as CefrLevel, v.word_count);
  }, 0);
  const missingSlots = TOP_N - articles.length;

  return (
    <main
      role="main"
      style={{
        maxWidth: "var(--content-max)",
        margin: "0 auto",
        padding: "var(--sp-4)",
      }}
    >
      <OnboardingBanner />
      <GreetingBlock totalArticles={TOP_N} totalMinutes={totalMinutes || 1} />
      <CategorySummaryChips articles={articles} />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}

        {missingSlots > 0 && (
          <div
            style={{
              background: "var(--color-surface-alt)",
              borderRadius: "var(--r-md)",
              padding: "var(--sp-5) var(--sp-4)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                color: "var(--color-text-secondary)",
                margin: 0,
              }}
            >
              오늘의 나머지 {missingSlots}개 기사는 준비 중이에요.
            </p>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-sm)",
                color: "var(--color-text-muted)",
                margin: "var(--sp-1) 0 0",
              }}
            >
              곧 Top {TOP_N} 브리핑이 채워질 예정입니다.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
