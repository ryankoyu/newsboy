"use client";

import Link from "next/link";
import type { ArticleWithDetails, CefrLevel } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { CategoryTag } from "@/components/CategoryTag";
import { ReadTimeMeta } from "@/components/ReadTimeMeta";

/**
 * "다음 기사 →" card — enhancement-plan.md Batch 1 #2 (연속 읽기 흐름).
 * Sits at the end of the article body so a reader can move to the next
 * ranked article without returning to the list ("출근길 한 손 사용").
 */
export function NextArticleCard({
  article,
  level,
}: {
  article: ArticleWithDetails;
  level: CefrLevel;
}) {
  const version = article.versions.find((v) => v.level === level) ?? article.versions[0];
  if (!version) return null;
  const minutes = estimateReadingMinutes(version.level as CefrLevel, version.word_count);

  return (
    <Link
      href={`/article/${article.slug}?level=${version.level}`}
      className="briefly-next-article-card"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        marginTop: "var(--sp-8)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--sp-4)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-sm)",
          color: "var(--color-text-muted)",
          margin: "0 0 var(--sp-2)",
        }}
      >
        다음 기사 →
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-2)",
          marginBottom: "var(--sp-2)",
        }}
      >
        <CategoryTag category={article.category} size="sm" />
        <ReadTimeMeta minutes={minutes} />
      </div>
      <h3
        lang="en"
        style={{
          fontFamily: "var(--font-en)",
          fontSize: "var(--fs-h3)",
          lineHeight: "var(--lh-h3)",
          color: "var(--color-text)",
          margin: 0,
        }}
      >
        {version.title}
      </h3>
    </Link>
  );
}
