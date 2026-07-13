"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticleWithDetails, CefrLevel, Word } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { useSession, notifySessionChange } from "@/lib/useSession";
import { READING_SCALE_VALUE, sessionStore } from "@/lib/session";
import { CategoryTag } from "@/components/CategoryTag";
import { ReadTimeMeta } from "@/components/ReadTimeMeta";
import { LevelSwitcher } from "@/components/LevelSwitcher";
import { ArticleViewerBar } from "@/components/ArticleViewerBar";
import { ArticleBody } from "@/components/ArticleBody";
import { WordListSection } from "@/components/WordListSection";
import { SourcesSection } from "@/components/SourcesSection";

/**
 * Article viewer — a3-ui-ux.md §2-2 (the app's core screen).
 * Order: header bar -> category/title -> sticky level switcher -> body
 * (clickable words) -> word list -> sources. No quiz section
 * (design-decisions.md §4.5 — explicitly excluded from MVP).
 *
 * Read-tracking (§3-3): marks the article read when ANY of:
 *  (a) scroll reaches 90% of body height
 *  (b) 30s+ time on page AND scroll >= 50%
 * (Quiz-submission trigger is N/A — no quiz in MVP.)
 */
export function ArticleViewer({
  article,
  initialLevel,
  hasExplicitLevel,
  wordsByVersion,
}: {
  article: ArticleWithDetails;
  initialLevel: CefrLevel;
  hasExplicitLevel: boolean;
  wordsByVersion: Record<string, Word[]>;
}) {
  const router = useRouter();
  const { session } = useSession();
  const bodyRef = useRef<HTMLDivElement>(null);
  const markedRef = useRef(false);

  // Level resolution (§2-2 point 3), derived — no setState-in-effect:
  //  1. user switched in this view (levelOverride)
  //  2. explicit ?level= in the URL (initialLevel)
  //  3. user's saved default level (post-hydration; SSR falls back to A2)
  const [levelOverride, setLevelOverride] = useState<CefrLevel | null>(null);
  const sessionLevel = session.getLevel();
  const level: CefrLevel =
    levelOverride ??
    (hasExplicitLevel ? initialLevel : null) ??
    (article.versions.some((v) => v.level === sessionLevel)
      ? sessionLevel
      : initialLevel);

  const version = useMemo(
    () => article.versions.find((v) => v.level === level) ?? article.versions[0],
    [article.versions, level]
  );

  // Keep user's default level in sync once they explicitly switch here,
  // and reflect selection in the URL (§2-2 point 3).
  function handleLevelChange(next: CefrLevel) {
    setLevelOverride(next);
    session.setLevel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("level", next);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }

  // Apply reading-scale for the user's chosen font size (§3-4). Depends on
  // the VALUE (fontSize) so a change from the Aa popover re-applies it.
  const fontSize = session.getFontSize();
  useEffect(() => {
    const scale = READING_SCALE_VALUE[fontSize];
    document.documentElement.style.setProperty("--reading-scale", String(scale));
    return () => {
      document.documentElement.style.setProperty("--reading-scale", "1");
    };
  }, [fontSize]);

  useEffect(() => {
    // Uses sessionStore directly (not the hook's `session`) because this
    // effect runs right after the hydration render, when the hook still
    // hands out the no-op fallback store.
    markedRef.current = sessionStore.isRead(article.id);
    const start = Date.now();

    function scrollRatio(): number {
      const el = bodyRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const total = rect.height;
      const visible = Math.min(window.innerHeight, rect.bottom) - rect.top;
      if (total <= 0) return 1;
      return Math.min(1, Math.max(0, visible / total));
    }

    function maybeMark() {
      if (markedRef.current) return;
      const ratio = scrollRatio();
      const elapsed = (Date.now() - start) / 1000;
      if (ratio >= 0.9 || (elapsed >= 30 && ratio >= 0.5)) {
        sessionStore.markRead(article.id);
        markedRef.current = true;
        notifySessionChange();
      }
    }

    window.addEventListener("scroll", maybeMark, { passive: true });
    const interval = window.setInterval(maybeMark, 5000);
    return () => {
      window.removeEventListener("scroll", maybeMark);
      window.clearInterval(interval);
    };
  }, [article.id]);

  if (!version) {
    return (
      <div style={{ padding: "var(--sp-6)" }}>
        <p>이 기사의 레벨 버전을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const minutes = estimateReadingMinutes(version.level as CefrLevel, version.word_count);
  const words = wordsByVersion[version.id] ?? [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      <ArticleViewerBar articleId={article.id} />

      <article
        lang="en"
        style={{
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          padding: "var(--sp-4) var(--sp-4) var(--sp-12)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "var(--sp-4)",
            marginBottom: "var(--sp-2)",
          }}
        >
          <CategoryTag category={article.category} />
          <ReadTimeMeta minutes={minutes} />
        </div>

        <h1
          style={{
            fontFamily: "var(--font-en)",
            fontSize: "var(--fs-h1)",
            lineHeight: "var(--lh-h1)",
            margin: "0 0 var(--sp-5)",
            color: "var(--color-text)",
          }}
        >
          {version.title}
        </h1>

        <div
          style={{
            position: "sticky",
            top: "var(--header-h)",
            zIndex: 10,
            background: "var(--color-bg)",
            paddingBottom: "var(--sp-4)",
            marginBottom: "var(--sp-2)",
          }}
        >
          <LevelSwitcher value={level} onChange={handleLevelChange} />
        </div>

        <div ref={bodyRef}>
          <ArticleBody
            key={version.id}
            articleId={article.id}
            level={version.level as CefrLevel}
            sentences={version.sentences}
            words={words}
          />
        </div>

        <WordListSection words={words} />
        <SourcesSection sources={article.sources} />
      </article>
    </div>
  );
}
