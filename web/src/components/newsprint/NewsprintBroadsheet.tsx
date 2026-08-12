"use client";

import Link from "next/link";
import type { ArticleWithDetails, CefrLevel, EditionWithArticles } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { useSession } from "@/lib/useSession";
import { countUniqueOutlets } from "@/lib/sourceOutlets";
import { LevelBadge } from "@/components/LevelBadge";
import { versionAtLevel } from "@/components/newsprint/StoryRow";
import { Cut, formatFolioDate } from "@/components/newsprint/chrome";

/**
 * Front page, desktop broadsheet — design_handoff_newsprint_skin §2.
 *
 * A fixed 1160px sheet on a dark desk, at true newspaper proportions: a thin
 * app utility row above the paper, the nameplate, a folio bar, the banner and
 * deck, then a three-column main deck with the lead in the centre and a
 * second tier of ruled columns beneath.
 *
 * SCOPE DECISION: the handoff's broadsheet also carries a weather ear, a
 * price ear, market tables and ad boxes. This app has no data for any of
 * them, and printing a fabricated stock table to make the page look more like
 * a newspaper would contradict the one rule the product is built on. Those
 * elements are dropped and the page is composed from articles alone; the
 * column rhythm, rule ladder and type scale are unchanged.
 */

const DISPLAY = "var(--font-display), Georgia, serif";

export function NewsprintBroadsheet({
  edition,
  isPastEdition = false,
}: {
  edition: EditionWithArticles | null;
  isPastEdition?: boolean;
}) {
  const { session } = useSession();
  const level = session.getLevel();

  // Version-less articles are dropped before layout, exactly as on the mobile
  // front page: every component below returns null for one, which on a fixed
  // three-column sheet leaves a hole in the grid rather than a shorter page.
  const articles = [...(edition?.articles ?? [])]
    .filter((a) => a.versions.length > 0)
    .sort((a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0));
  const lead = articles[0] ?? null;
  const leftColumn = articles.slice(1, 3);
  const rightColumn = articles.slice(3, 5);
  const secondTier = articles.slice(5);

  const totalMinutes = articles.reduce((sum, a) => {
    const v = versionAtLevel(a, level);
    return sum + estimateReadingMinutes(level, v?.word_count ?? null);
  }, 0);

  return (
    <div
      style={{
        background: "var(--paper-desk)",
        minHeight: "100vh",
        padding: 28,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* ── The only app chrome outside the paper ── */}
      <div
        style={{
          width: 1160,
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 12,
          fontFamily: "var(--font-ui)",
          fontSize: 12.5,
          color: "#cabfa6",
        }}
      >
        <span>{edition ? formatFolioDate(edition.edition_date) : ""}</span>
        <span style={{ display: "flex", gap: 18 }}>
          <span>레벨 {level}</span>
          <Link href="/saved" style={{ color: "#cabfa6", textDecoration: "none" }}>
            내 서재
          </Link>
          <Link href="/settings" style={{ color: "#cabfa6", textDecoration: "none" }}>
            설정
          </Link>
        </span>
      </div>

      {/* ── The sheet ── */}
      <div
        className="np-paper"
        style={{
          width: 1160,
          maxWidth: "100%",
          padding: "26px 30px 30px",
          position: "relative",
          boxShadow:
            "0 18px 60px rgba(0,0,0,0.45), inset 0 0 140px rgba(112,88,48,0.42)",
        }}
      >
        {/* ── Nameplate ──
            The handoff flanks this with a weather ear and a price ear; with
            no data behind either, the mark simply runs full width. */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "var(--font-nameplate), serif",
              fontSize: 76,
              lineHeight: 1,
              color: "var(--ink-strong)",
            }}
          >
            Newsboy.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              marginTop: 8,
            }}
          >
            <span style={{ fontSize: 8, letterSpacing: "0.45em", color: "var(--rule-mid)" }}>
              ◆◆◆
            </span>
            <span
              style={{
                fontFamily: DISPLAY,
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: 13,
                color: "var(--ink-soft)",
              }}
            >
              Today’s News. Your English.
            </span>
            <span style={{ fontSize: 8, letterSpacing: "0.45em", color: "var(--rule-mid)" }}>
              ◆◆◆
            </span>
          </div>
        </div>

        {/* ── Folio bar ── */}
        <div
          style={{
            margin: "14px 0 0",
            borderTop: "1px solid var(--rule-strong)",
            borderBottom: "3px double var(--rule-strong)",
            padding: "6px 0",
            display: "flex",
            justifyContent: "space-between",
            fontFamily: DISPLAY,
            fontWeight: 600,
            fontStretch: "86%",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ink)",
          }}
        >
          <span>{articles.length} Articles</span>
          <span>
            {edition ? formatFolioDate(edition.edition_date) : ""}
            {isPastEdition ? " · Back Number" : ""}
          </span>
          <span>One Cent.</span>
        </div>

        {!lead ? (
          <p
            style={{
              margin: "70px 0",
              textAlign: "center",
              fontFamily: "var(--font-ui)",
              fontSize: 14,
              color: "var(--ink-muted)",
            }}
          >
            오늘의 브리핑을 준비하고 있어요.
          </p>
        ) : (
          <>
            <Banner article={lead} level={level} />

            {/* ── Main deck: side column | lead | side column ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2.5fr 1fr",
                gap: 20,
                marginTop: 18,
                alignItems: "start",
              }}
            >
              <SideColumn articles={leftColumn} level={level} rule="right" />
              <LeadStory article={lead} level={level} />
              <SideColumn articles={rightColumn} level={level} rule="left" />
            </div>

            {secondTier.length > 0 && (
              <>
                <div
                  style={{
                    margin: "24px 0 0",
                    borderTop: "3px double var(--rule-strong)",
                    paddingTop: 14,
                  }}
                >
                  <h2
                    style={{
                      margin: "0 0 12px",
                      fontFamily: DISPLAY,
                      fontWeight: 800,
                      fontStretch: "74%",
                      fontSize: 15,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      textAlign: "center",
                      color: "var(--ink-strong)",
                    }}
                  >
                    More of Today’s Brief
                  </h2>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${Math.min(secondTier.length, 5)}, 1fr)`,
                    gap: 18,
                    alignItems: "start",
                  }}
                >
                  {secondTier.map((article, i) => (
                    <TierColumn
                      key={article.id}
                      article={article}
                      level={level}
                      ruled={i > 0}
                    />
                  ))}
                </div>
              </>
            )}

            <p
              style={{
                margin: "26px 0 0",
                paddingTop: 10,
                borderTop: "1px solid var(--rule-strong)",
                textAlign: "center",
                fontFamily: "var(--font-ui)",
                fontSize: 11.5,
                color: "var(--ink-muted)",
              }}
            >
              오늘 브리핑 전체를 읽는 데 약 {totalMinutes}분 · 레벨 {level}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Banner size ramp.
 *
 * The handoff fixes the banner at 64px with `white-space: nowrap` and says it
 * must stay on one line. That holds for the prototype's short 1902 headline
 * and breaks on a real one: "South Korea Sells a Lot More to the World" ran
 * off the right edge of the sheet.
 *
 * Counting characters cannot fix it. Character count is not width — a title
 * of caps and Ms is far wider than the same count in lowercase and Is, and
 * the ramp has no idea which it is holding. So the banner wraps instead, and
 * the ramp only keeps a long headline from swallowing the page. Wrapping a
 * banner across two lines is ordinary newspaper practice; running one off the
 * paper is not.
 */
function bannerSize(title: string): number {
  const n = title.length;
  if (n <= 30) return 64;
  if (n <= 48) return 56;
  return 46;
}

/** Banner headline + deck, closed by a double rule. */
function Banner({ article, level }: { article: ArticleWithDetails; level: CefrLevel }) {
  const version = versionAtLevel(article, level);
  if (!version) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <h1
        lang="en"
        style={{
          margin: 0,
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontStretch: "66%",
          fontSize: bannerSize(version.title),
          lineHeight: 0.96,
          letterSpacing: "-0.012em",
          textAlign: "center",
          textTransform: "uppercase",
          // Wraps rather than overflowing; `balance` keeps a two-line banner
          // from leaving one word stranded on the second line.
          textWrap: "balance",
          color: "var(--ink-strong)",
        }}
      >
        <Link
          href={`/article/${article.slug}?level=${version.level}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {version.title}
        </Link>
      </h1>
      {article.event_summary && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            marginTop: 12,
          }}
        >
          <span style={{ fontSize: 8, letterSpacing: "0.45em", color: "var(--rule-mid)" }}>
            ◆◆◆
          </span>
          <p
            lang="en"
            style={{
              margin: 0,
              maxWidth: 780,
              fontFamily: DISPLAY,
              fontWeight: 700,
              fontStretch: "88%",
              fontSize: 27,
              lineHeight: 1.2,
              textAlign: "center",
              color: "#26221c",
            }}
          >
            {article.event_summary}
          </p>
          <span style={{ fontSize: 8, letterSpacing: "0.45em", color: "var(--rule-mid)" }}>
            ◆◆◆
          </span>
        </div>
      )}
      <div style={{ marginTop: 14, borderBottom: "3px double var(--rule-strong)" }} />
    </div>
  );
}

/** The centre story: credit line, justified body left, engraving right. */
function LeadStory({ article, level }: { article: ArticleWithDetails; level: CefrLevel }) {
  const version = versionAtLevel(article, level);
  if (!version) return null;
  const body = version.sentences.slice(0, 8).join(" ");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 16, alignItems: "start" }}>
      <div>
        <p
          style={{
            margin: "0 0 8px",
            fontFamily: DISPLAY,
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--ink-muted)",
          }}
        >
          Rewritten from {countUniqueOutlets(article.sources)} Sources
        </p>
        <p
          lang="en"
          className="np-dropcap"
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.45,
            textAlign: "justify",
            hyphens: "auto",
            color: "var(--ink)",
          }}
        >
          {body}
        </p>
        <JumpLine slug={article.slug} level={version.level as CefrLevel} />
      </div>
      {/* The one engraving on the sheet — the lead's, and nowhere else. */}
      <Cut
        articleId={article.id}
        height={330}
        margin="0"
        label={"ENGRAVING\n1000×1300\n대표 삽화"}
        caption={article.category?.label ?? "Today"}
      />
    </div>
  );
}

/** A flanking column of stacked stories, ruled off from the centre. */
function SideColumn({
  articles,
  level,
  rule,
}: {
  articles: ArticleWithDetails[];
  level: CefrLevel;
  rule: "left" | "right";
}) {
  if (articles.length === 0) return <div />;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        paddingRight: rule === "right" ? 20 : 0,
        paddingLeft: rule === "left" ? 20 : 0,
        borderRight: rule === "right" ? "1px solid var(--rule)" : undefined,
        borderLeft: rule === "left" ? "1px solid var(--rule)" : undefined,
      }}
    >
      {articles.map((article, i) => {
        const version = versionAtLevel(article, level);
        if (!version) return null;
        return (
          <div key={article.id}>
            {i > 0 && (
              <div
                style={{
                  width: 52,
                  height: 1,
                  background: "var(--rule-mid)",
                  margin: "14px auto",
                }}
              />
            )}
            <h3
              lang="en"
              style={{
                margin: 0,
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontStretch: "74%",
                fontSize: 19,
                lineHeight: 1.1,
                textAlign: "center",
                textTransform: "uppercase",
                color: "var(--ink-strong)",
              }}
            >
              {version.title}
            </h3>
            <p
              lang="en"
              style={{
                margin: "9px 0 0",
                fontSize: 12,
                lineHeight: 1.45,
                textAlign: "justify",
                hyphens: "auto",
                color: "var(--ink)",
              }}
            >
              {version.sentences.slice(0, 4).join(" ")}
            </p>
            <JumpLine slug={article.slug} level={version.level as CefrLevel} />
          </div>
        );
      })}
    </div>
  );
}

/** One column of the second tier. */
function TierColumn({
  article,
  level,
  ruled,
}: {
  article: ArticleWithDetails;
  level: CefrLevel;
  ruled: boolean;
}) {
  const { session } = useSession();
  const version = versionAtLevel(article, level);
  if (!version) return null;
  const isRead = session.isRead(article.id);
  return (
    <div
      style={{
        paddingLeft: ruled ? 18 : 0,
        borderLeft: ruled ? "1px solid var(--rule)" : undefined,
        opacity: isRead ? 0.62 : 1,
      }}
    >
      <h3
        lang="en"
        style={{
          margin: 0,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontStretch: "74%",
          fontSize: 15,
          lineHeight: 1.12,
          textTransform: "uppercase",
          color: "var(--ink-strong)",
        }}
      >
        {version.title}
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "7px 0" }}>
        <LevelBadge level={version.level as CefrLevel} />
        <span style={{ fontFamily: "var(--font-ui)", fontSize: 10.5, color: "var(--ink-faint)" }}>
          {estimateReadingMinutes(version.level as CefrLevel, version.word_count)}분
          {article.category?.label ? ` · ${article.category.label}` : ""}
        </span>
      </div>
      <p
        lang="en"
        style={{
          margin: 0,
          fontSize: 11.5,
          lineHeight: 1.45,
          textAlign: "justify",
          hyphens: "auto",
          color: "var(--ink)",
        }}
      >
        {version.sentences.slice(0, 3).join(" ")}
      </p>
      <JumpLine slug={article.slug} level={version.level as CefrLevel} />
    </div>
  );
}

/**
 * The jump line a newspaper prints where a story runs on. Here it is the
 * actual link into the reader rather than a page reference.
 */
function JumpLine({ slug, level }: { slug: string; level: CefrLevel }) {
  return (
    <Link
      href={`/article/${slug}?level=${level}`}
      style={{
        display: "block",
        marginTop: 8,
        fontFamily: DISPLAY,
        fontStyle: "italic",
        fontSize: 11,
        color: "var(--action)",
        textDecoration: "none",
      }}
    >
      Continued in the reader. →
    </Link>
  );
}
