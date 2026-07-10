"use client";

import Link from "next/link";
import type { ArticleWithDetails, CefrLevel } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { CategoryTag } from "@/components/CategoryTag";
import { LevelBadge } from "@/components/LevelBadge";
import { ReadTimeMeta } from "@/components/ReadTimeMeta";
import { useSession } from "@/lib/useSession";

/**
 * Home article card — a3-ui-ux.md §2-1.
 * Shows the version at the user's current level; "읽음" marker + reduced
 * opacity if already read (§3-3).
 */
export function ArticleCard({ article }: { article: ArticleWithDetails }) {
  const { session } = useSession();
  const level = session.getLevel();
  const version =
    article.versions.find((v) => v.level === level) ?? article.versions[0];
  const isRead = session.isRead(article.id);

  if (!version) return null;

  const minutes = estimateReadingMinutes(
    version.level as CefrLevel,
    version.word_count
  );
  const preview = version.sentences[0] ?? "";

  return (
    <Link
      href={`/article/${article.slug}?level=${version.level}`}
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        background: "var(--color-surface)",
        borderRadius: "var(--r-md)",
        padding: "var(--sp-4)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-card)",
        opacity: isRead ? 0.7 : 1,
        transition: "box-shadow var(--dur-base) var(--ease), transform var(--dur-base) var(--ease)",
      }}
      className="briefly-article-card"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--sp-3)",
          gap: "var(--sp-2)",
        }}
      >
        <CategoryTag category={article.category} size="sm" />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
          <LevelBadge level={version.level as CefrLevel} />
          <ReadTimeMeta minutes={minutes} />
        </div>
      </div>
      <h3
        lang="en"
        style={{
          fontFamily: "var(--font-en)",
          fontSize: "var(--fs-h3)",
          lineHeight: "var(--lh-h3)",
          margin: "0 0 var(--sp-2)",
          color: "var(--color-text)",
        }}
      >
        {version.title}
      </h3>
      {preview && (
        <p
          lang="en"
          style={{
            fontFamily: "var(--font-en)",
            fontSize: "var(--fs-sm)",
            color: "var(--color-text-secondary)",
            margin: 0,
          }}
        >
          {preview}
        </p>
      )}
      {isRead && (
        <div
          style={{
            marginTop: "var(--sp-2)",
            textAlign: "right",
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-sm)",
            color: "var(--color-success)",
          }}
        >
          ✓ 읽음
        </div>
      )}
    </Link>
  );
}
