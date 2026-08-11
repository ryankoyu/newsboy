"use client";

import Link from "next/link";
import type { ArticleWithDetails, CefrLevel } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { useSession } from "@/lib/useSession";
import { LevelBadge } from "@/components/LevelBadge";

const DISPLAY = "var(--font-display), Georgia, serif";

/** The article's version at the reader's level, falling back to what exists. */
export function versionAtLevel(article: ArticleWithDetails, level: CefrLevel) {
  return article.versions.find((v) => v.level === level) ?? article.versions[0];
}

/**
 * One ruled story row — design_handoff_newsprint_skin §1, "Story rows":
 * the headline in condensed display serif, a dek, and a meta line. Read
 * stories dim to .62 and print the 읽음 marker, the same treatment the
 * handoff gives mastered wordbook entries.
 *
 * The handoff sets an 84px cut in the left column. Dropped: only the day's
 * lead carries an engraving (chrome.tsx `Cut`), so every row here would have
 * printed an empty frame. Type alone also lets the headline run full width.
 *
 * Shared by the front page's "More Top Stories" and the scrap drawer in
 * My Index, so the two lists cannot drift apart.
 */
export function StoryRow({
  article,
  level,
  last = false,
}: {
  article: ArticleWithDetails;
  level: CefrLevel;
  /** Drop the divider on the final row of a list. */
  last?: boolean;
}) {
  const { session } = useSession();
  const version = versionAtLevel(article, level);
  if (!version) return null;
  const isRead = session.isRead(article.id);
  const minutes = estimateReadingMinutes(version.level as CefrLevel, version.word_count);

  return (
    <Link
      href={`/article/${article.slug}?level=${version.level}`}
      style={{
        display: "block",
        padding: "13px 0",
        borderBottom: last ? undefined : "1px solid var(--rule-hair)",
        textDecoration: "none",
        opacity: isRead ? 0.62 : 1,
      }}
    >
      <div>
        <h3
          lang="en"
          style={{
            margin: 0,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontStretch: "78%",
            fontSize: 17,
            lineHeight: 1.12,
            color: "var(--ink-strong)",
          }}
        >
          {version.title}
        </h3>
        {version.sentences[0] && (
          <p
            lang="en"
            style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-soft)" }}
          >
            {version.sentences[0]}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
          <LevelBadge level={version.level as CefrLevel} />
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faint)" }}>
            {minutes}분 읽기
            {article.category?.label ? ` · ${article.category.label}` : ""}
          </span>
          {isRead && (
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink-muted)",
              }}
            >
              ✓ 읽음
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
