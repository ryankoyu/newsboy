"use client";

import Link from "next/link";
import type { ArticleWithDetails, CefrLevel, EditionWithArticles } from "@/lib/types";
import { useSession } from "@/lib/useSession";
import { formatPastEditionLabel } from "@/lib/editionDate";
import { EmptyState } from "@/components/EmptyState";
import { NewsprintTabBar } from "@/components/newsprint/NewsprintTabBar";
import { Cut, FolioLine, Nameplate, Ornament, formatFolioDate } from "@/components/newsprint/chrome";
import { ArchiveIcon, GearIcon } from "@/components/newsprint/icons";
import { StoryRow, versionAtLevel as versionOf } from "@/components/newsprint/StoryRow";

/**
 * Front page, newsprint skin — design_handoff_newsprint_skin §1
 * ("Front Page — mobile", 430px).
 *
 * Page one of a newspaper: nameplate, section strip, then a double-ruled
 * clipping block holding the day's lead — folio line, banner headline, deck,
 * a three-column hero with side-heads flanking the engraving, and a
 * two-column lead paragraph with its drop cap. "More Top Stories" and the
 * remaining articles follow as ruled rows.
 *
 * Everything is real edition data. Where the handoff's prototype carries
 * 1902 furniture that has no counterpart here — a fixed dateline, five nav
 * columns, ad boxes — this uses the app's own values or drops the element
 * rather than printing something untrue.
 */

const DISPLAY = "var(--font-display), Georgia, serif";

export function NewsprintFrontPage({
  edition,
  isPastEdition = false,
}: {
  edition: EditionWithArticles | null;
  isPastEdition?: boolean;
}) {
  const { session } = useSession();
  const level = session.getLevel();

  const articles = [...(edition?.articles ?? [])].sort(
    (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
  );

  const lead = articles[0] ?? null;
  const leftHeads = articles.slice(1, 3);
  const rightHeads = articles.slice(3, 5);
  const rest = articles.slice(5);

  // Section strip: the sections that actually appear in today's edition.
  // Not navigation — there is no category filter in the app — so these are
  // set as a masthead strip and carry no link.
  const sections = Array.from(
    new Map(
      articles
        .map((a) => a.category)
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => [c.slug, c.label])
    ).values()
  );

  return (
    <div style={{ display: "flex", justifyContent: "center", background: "var(--paper-desk)" }}>
      <div
        className="np-paper"
        style={{
          width: 430,
          maxWidth: "100%",
          minHeight: "100vh",
          padding: "0 16px 96px",
          position: "relative",
        }}
      >
        {/* ── App bar ── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 2px 8px",
          }}
        >
          <Link href="/settings" aria-label="설정" style={{ color: "var(--rule-mid)" }}>
            <GearIcon />
          </Link>
          <Nameplate size={34} />
          <Link href="/archive" aria-label="지난 브리핑" style={{ color: "var(--rule-mid)" }}>
            <ArchiveIcon />
          </Link>
        </header>

        {/* ── Section strip ── */}
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "baseline",
            padding: "10px 2px 9px",
            borderBottom: "1px solid var(--rule-hair)",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
          className="briefly-hscroll"
        >
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
              color: "var(--ink-strong)",
              borderBottom: "2px solid var(--ink-strong)",
              paddingBottom: 4,
              whiteSpace: "nowrap",
            }}
          >
            Latest
          </span>
          {sections.map((label) => (
            <span
              key={label}
              style={{
                fontFamily: DISPLAY,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "var(--ink-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {!edition || !lead ? (
          <div style={{ padding: "40px 0" }}>
            <EmptyState
              title="오늘의 브리핑을 준비하고 있어요."
              description="보통 아침에 도착해요."
            />
          </div>
        ) : (
          <>
            {/* ── The clipping block: two rules around the day's lead ── */}
            <div style={{ marginTop: 14, border: "1px solid var(--rule)", padding: 3 }}>
              <div style={{ border: "1px solid var(--rule)", padding: "14px 12px 16px" }}>
                <FolioLine
                  dateLabel={formatFolioDate(edition.edition_date)}
                  bordered={false}
                />

                <LeadHeadline article={lead} level={level} />

                <Ornament margin="12px 0 11px" />

                {/* ── Hero: side-heads | engraving | side-heads ── */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.35fr 1fr",
                    gap: 9,
                    alignItems: "start",
                  }}
                >
                  <SideHeadStack articles={leftHeads} level={level} side="left" />
                  {/* The one engraving on the page — the lead's, and nowhere else. */}
                  <Cut
                    articleId={lead.id}
                    height={196}
                    margin="0"
                    label={"ENGRAVING\n820×1080\n대표 삽화"}
                    caption={lead.category?.label ?? "Today"}
                  />
                  <SideHeadStack articles={rightHeads} level={level} side="right" />
                </div>

                <div style={{ margin: "13px 0 11px", height: 1, background: "var(--rule-mid)" }} />

                <LeadParagraphs article={lead} level={level} />

                {/* ── Footer action ── */}
                <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "12px 0 0" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--rule-hair)" }} />
                  <Link
                    href={`/article/${lead.slug}?level=${versionOf(lead, level).level}`}
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 11.5,
                      letterSpacing: "0.05em",
                      color: "var(--action)",
                    }}
                  >
                    이어서 읽기
                  </Link>
                  <div style={{ flex: 1, height: 1, background: "var(--rule-hair)" }} />
                </div>
              </div>
            </div>

            {isPastEdition && (
              <p
                style={{
                  margin: "10px 0 0",
                  fontFamily: "var(--font-ui)",
                  fontSize: 11.5,
                  color: "var(--ink-muted)",
                  textAlign: "center",
                }}
              >
                {formatPastEditionLabel(edition.edition_date)} 브리핑이에요.
              </p>
            )}

            {rest.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    borderBottom: "2px solid var(--rule-strong)",
                    paddingBottom: 5,
                    margin: "22px 0 0",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: DISPLAY,
                      fontWeight: 800,
                      fontStretch: "78%",
                      fontSize: 16,
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      color: "var(--ink-strong)",
                    }}
                  >
                    More Top Stories
                  </h2>
                  <Link
                    href="/archive"
                    style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--action)" }}
                  >
                    전체 보기
                  </Link>
                </div>

                {rest.map((article) => (
                  <StoryRow key={article.id} article={article} level={level} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <NewsprintTabBar />
    </div>
  );
}

function LeadHeadline({ article, level }: { article: ArticleWithDetails; level: CefrLevel }) {
  const version = versionOf(article, level);
  if (!version) return null;
  return (
    <>
      <h1
        lang="en"
        style={{
          margin: "12px 0 0",
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontStretch: "70%",
          fontSize: 37,
          lineHeight: 1,
          letterSpacing: "-0.005em",
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
            margin: "11px 0 0",
            fontFamily: DISPLAY,
            fontStyle: "italic",
            fontWeight: 600,
            fontStretch: "85%",
            fontSize: 16,
            lineHeight: 1.28,
            textAlign: "center",
            color: "#26221c",
          }}
        >
          {article.event_summary}
        </p>
      )}
    </>
  );
}

/** A column of centred side-heads, ruled off from the engraving beside it. */
function SideHeadStack({
  articles,
  level,
  side,
}: {
  articles: ArticleWithDetails[];
  level: CefrLevel;
  side: "left" | "right";
}) {
  if (articles.length === 0) return <div />;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingRight: side === "left" ? 8 : 0,
        paddingLeft: side === "right" ? 8 : 0,
        borderRight: side === "left" ? "1px solid var(--rule-hair)" : undefined,
        borderLeft: side === "right" ? "1px solid var(--rule-hair)" : undefined,
      }}
    >
      {articles.map((article, i) => {
        const version = versionOf(article, level);
        if (!version) return null;
        return (
          <div key={article.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {i > 0 && <div style={{ height: 1, background: "var(--rule-hair)" }} />}
            <Link href={`/article/${article.slug}?level=${version.level}`} style={{ textDecoration: "none" }}>
              <h3
                lang="en"
                style={{
                  margin: 0,
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontStretch: "72%",
                  fontSize: 12.5,
                  lineHeight: 1.12,
                  textAlign: "center",
                  textTransform: "uppercase",
                  color: "var(--ink-strong)",
                }}
              >
                {version.title}
              </h3>
              {version.sentences[0] && (
                <p
                  lang="en"
                  style={{
                    margin: "8px 0 0",
                    fontSize: 10.5,
                    lineHeight: 1.42,
                    textAlign: "center",
                    color: "#2b261f",
                  }}
                >
                  {version.sentences[0]}
                </p>
              )}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

/** The lead, set in two justified columns with a drop cap. */
function LeadParagraphs({ article, level }: { article: ArticleWithDetails; level: CefrLevel }) {
  const version = versionOf(article, level);
  if (!version) return null;
  // Two short columns of body — the front page is a teaser, and the reader
  // continues in the article view.
  const [first, second] = [
    version.sentences.slice(0, 2).join(" "),
    version.sentences.slice(2, 4).join(" "),
  ];
  const columnStyle = {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
    textAlign: "justify" as const,
    hyphens: "auto" as const,
    color: "var(--ink)",
  };
  return (
    <div lang="en" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <p lang="en" className="np-dropcap" style={columnStyle}>
        {first}
      </p>
      {second && (
        <p lang="en" style={columnStyle}>
          {second}
        </p>
      )}
    </div>
  );
}
