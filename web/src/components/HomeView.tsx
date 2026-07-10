"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { EditionWithArticles, CefrLevel } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { useSession } from "@/lib/useSession";
import { GreetingBlock } from "@/components/GreetingBlock";
import { CategorySummaryChips } from "@/components/CategorySummaryChips";
import { ArticleCard } from "@/components/ArticleCard";
import { ArticleCardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";

const TOP_N = 10;

export function HomeView({ edition }: { edition: EditionWithArticles | null }) {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const needsOnboarding = hydrated && !session.hasOnboarded();

  // Redirect is a side effect on an external system (the router) — no local
  // state involved (lint: react-hooks/set-state-in-effect compliant).
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  if (!hydrated || needsOnboarding) {
    // Avoid a content flash before the onboarding redirect decision lands.
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
