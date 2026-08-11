"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ArticleWithDetails, CefrLevel, EditionWithArticles, Word } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { useSession } from "@/lib/useSession";
import { READING_SCALE_VALUE, sessionStore } from "@/lib/session";
import { countUniqueOutlets } from "@/lib/sourceOutlets";
import { groupSourcesByOutlet } from "@/lib/sourceOutlets";
import { LevelBadge } from "@/components/LevelBadge";
import { FontSizePopover } from "@/components/FontSizePopover";
import { LevelSwitcher } from "@/components/LevelSwitcher";
import { NewsprintArticleBody } from "@/components/newsprint/NewsprintArticleBody";
import {
  Cut,
  FolioLine,
  Hairline,
  Nameplate,
  Ornament,
  RuledBox,
  formatFolioDate,
} from "@/components/newsprint/chrome";
import { BackIcon, BookmarkIcon, MoreIcon, SpeakerIcon } from "@/components/newsprint/icons";

/**
 * Article reader, newsprint skin — design_handoff_newsprint_skin §3
 * ("Article Reader — mobile").
 *
 * A 430px paper column: app bar, folio rule, headline / deck / byline, the
 * level + meta row, an engraving, then the justified body at 17px/1.72 with
 * its drop cap. Sources and "Next in Today's Brief" close the page, and a
 * three-column action bar sits fixed at the foot.
 *
 * Read-tracking, level resolution and reading-scale behave exactly as in the
 * standard `ArticleViewer` — this is a re-skin, not a re-spec.
 */
export function NewsprintArticleViewer({
  article,
  initialLevel,
  hasExplicitLevel,
  wordsByVersion,
  edition,
}: {
  article: ArticleWithDetails;
  initialLevel: CefrLevel;
  hasExplicitLevel: boolean;
  wordsByVersion: Record<string, Word[]>;
  edition?: EditionWithArticles | null;
}) {
  const router = useRouter();
  const { session } = useSession();
  const bodyRef = useRef<HTMLDivElement>(null);
  const markedRef = useRef(false);

  const [levelOverride, setLevelOverride] = useState<CefrLevel | null>(null);
  const sessionLevel = session.getLevel();
  const level: CefrLevel =
    levelOverride ??
    (hasExplicitLevel ? initialLevel : null) ??
    (article.versions.some((v) => v.level === sessionLevel) ? sessionLevel : initialLevel);

  const version = useMemo(
    () => article.versions.find((v) => v.level === level) ?? article.versions[0],
    [article.versions, level]
  );

  function handleLevelChange(next: CefrLevel) {
    setLevelOverride(next);
    session.setLevel(next);
    const url = new URL(window.location.href);
    url.searchParams.set("level", next);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }

  // Aa scales the 17px body and nothing else — headline sizes are fixed by
  // the page design (handoff, "Interactions & Behavior").
  const fontSize = session.getFontSize();
  useEffect(() => {
    const scale = READING_SCALE_VALUE[fontSize];
    document.documentElement.style.setProperty("--reading-scale", String(scale));
    return () => {
      document.documentElement.style.setProperty("--reading-scale", "1");
    };
  }, [fontSize]);

  // Same read-tracking rule as the standard viewer (a3-ui-ux.md §3-3).
  useEffect(() => {
    markedRef.current = sessionStore.isRead(article.id);
    const start = Date.now();

    function scrollRatio(): number {
      const el = bodyRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const total = rect.height;
      if (total <= 0) return 1;
      const visible = Math.min(window.innerHeight, rect.bottom) - rect.top;
      return Math.min(1, Math.max(0, visible / total));
    }

    function maybeMark() {
      if (markedRef.current) return;
      const ratio = scrollRatio();
      const elapsed = (Date.now() - start) / 1000;
      if (ratio >= 0.9 || (elapsed >= 30 && ratio >= 0.5)) {
        sessionStore.markRead(article.id);
        markedRef.current = true;
      }
    }

    window.addEventListener("scroll", maybeMark, { passive: true });
    const timer = window.setInterval(maybeMark, 5000);
    return () => {
      window.removeEventListener("scroll", maybeMark);
      window.clearInterval(timer);
    };
  }, [article.id]);

  const minutes = estimateReadingMinutes(version.level as CefrLevel, version.word_count);
  const words = wordsByVersion[version.id] ?? [];
  const outlets = groupSourcesByOutlet(article.sources);

  const rankedArticles = [...(edition?.articles ?? [])].sort(
    (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
  );
  const currentIndex = rankedArticles.findIndex((a) => a.id === article.id);
  const nextArticle = currentIndex >= 0 ? rankedArticles[currentIndex + 1] ?? null : null;
  const nextVersion =
    nextArticle?.versions.find((v) => v.level === level) ?? nextArticle?.versions[0] ?? null;

  const dateLabel = edition ? formatFolioDate(edition.edition_date) : "";

  return (
    <div style={{ display: "flex", justifyContent: "center", background: "var(--paper-desk)" }}>
      <div
        className="np-paper"
        style={{
          width: 430,
          maxWidth: "100%",
          minHeight: "100vh",
          padding: "0 18px 104px",
          position: "relative",
        }}
      >
        {/* ── App bar. The only chrome that is not typeset. ── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 2px 8px",
          }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로"
            style={{
              border: "none",
              background: "none",
              padding: 0,
              color: "var(--rule-mid)",
            }}
          >
            <BackIcon />
          </button>
          <Nameplate size={24} />
          <FontSizePopover />
        </header>

        {dateLabel && <FolioLine dateLabel={dateLabel} />}

        {/* ── Headline block ── */}
        <h1
          lang="en"
          style={{
            margin: "16px 0 0",
            fontFamily: "var(--font-display), Georgia, serif",
            fontWeight: 800,
            fontStretch: "70%",
            fontSize: 38,
            lineHeight: 1,
            textAlign: "center",
            textTransform: "uppercase",
            color: "var(--ink-strong)",
          }}
        >
          {version.title}
        </h1>

        {article.event_summary && (
          <p
            lang="en"
            style={{
              margin: "12px 0 0",
              fontFamily: "var(--font-display), Georgia, serif",
              fontStyle: "italic",
              fontWeight: 600,
              fontStretch: "86%",
              fontSize: 17,
              lineHeight: 1.3,
              textAlign: "center",
              color: "#26221c",
            }}
          >
            {article.event_summary}
          </p>
        )}

        <p
          style={{
            margin: "10px 0 0",
            textAlign: "center",
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--rule-mid)",
          }}
        >
          {/* Not a byline in the journalistic sense — the article is rewritten
              from the cross-checked sources listed at the foot of the page. */}
          Rewritten from {countUniqueOutlets(article.sources)} Sources
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            margin: "12px 0 0",
          }}
        >
          <LevelBadge level={version.level as CefrLevel} />
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 11.5, color: "var(--ink-muted)" }}>
            {minutes}분 읽기 · 소스 {countUniqueOutlets(article.sources)} · 단어 {words.length}
          </span>
        </div>

        <Cut
          height={220}
          label={"ENGRAVING\n1200×880\n기사 삽화"}
          caption={article.category?.label ?? undefined}
        />

        {/* ── Level switcher. An app control, so it keeps Newsboy's look. ── */}
        <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 0" }}>
          <LevelSwitcher value={level} onChange={handleLevelChange} />
        </div>

        <Hairline />

        <div ref={bodyRef}>
          <NewsprintArticleBody
            key={version.id}
            articleId={article.id}
            level={version.level as CefrLevel}
            sentences={version.sentences}
            words={words}
          />
        </div>

        <Ornament />

        {outlets.length > 0 && (
          <RuledBox head="Sources">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 7,
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--ink-soft)",
              }}
            >
              {outlets.map((group) => (
                <div key={group.domain} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>{group.label}</span>
                  <a
                    href={group.sources[0]?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--action)", whiteSpace: "nowrap" }}
                  >
                    보기
                  </a>
                </div>
              ))}
            </div>
          </RuledBox>
        )}

        {nextArticle && nextVersion && (
          <section style={{ margin: "18px 0 0", borderTop: "3px double var(--rule-strong)", paddingTop: 12 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display), Georgia, serif",
                fontWeight: 800,
                fontStretch: "76%",
                fontSize: 13,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ink)",
              }}
            >
              Next in Today’s Brief
            </h2>
            <h3
              lang="en"
              style={{
                margin: "8px 0 0",
                fontFamily: "var(--font-display), Georgia, serif",
                fontWeight: 700,
                fontStretch: "78%",
                fontSize: 20,
                lineHeight: 1.12,
                color: "var(--ink-strong)",
              }}
            >
              {nextVersion.title}
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
              <LevelBadge level={nextVersion.level as CefrLevel} />
              <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faint)" }}>
                {estimateReadingMinutes(nextVersion.level as CefrLevel, nextVersion.word_count)}분 읽기
              </span>
              <span style={{ flex: 1 }} />
              <Link
                href={`/article/${nextArticle.slug}?level=${nextVersion.level}`}
                style={{ fontFamily: "var(--font-ui)", fontSize: 11.5, color: "var(--action)" }}
              >
                이어서 읽기 →
              </Link>
            </div>
          </section>
        )}
      </div>

      {/* ── Foot bar. Sits on paper, so it takes --paper-tabbar. ── */}
      <nav
        aria-label="기사 액션"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 430,
            maxWidth: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            borderTop: "2px solid var(--rule-strong)",
            background: "var(--paper-tabbar)",
            padding: "11px 0 16px",
          }}
        >
          {[
            { Icon: SpeakerIcon, label: "듣기" },
            { Icon: BookmarkIcon, label: "저장" },
            { Icon: MoreIcon, label: "더보기" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                color: "var(--ink)",
              }}
            >
              <item.Icon size={18} />
              {item.label}
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
