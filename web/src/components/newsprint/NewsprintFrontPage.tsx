"use client";

import { useRef, useState } from "react";
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
  /** Selected section slug, or null for "Latest". Not persisted — the front
   *  page opens on the whole edition every time, the way a paper does. */
  const [section, setSection] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // An article with no versions has no headline, no dek and no body — every
  // slot on this page would set it as a blank. Worse, the lead's jump line
  // reads `.level` off its version, so a version-less article at rank 1 took
  // the whole front page down. Dropped once, here, rather than guarded in
  // five places.
  const articles = [...(edition?.articles ?? [])]
    .filter((a) => a.versions.length > 0)
    .sort((a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0));

  const lead = articles[0] ?? null;
  const leadVersion = lead ? versionOf(lead, level) : null;
  const leftHeads = articles.slice(1, 3);
  const rightHeads = articles.slice(3, 5);
  const rest = articles.slice(5);

  // Section strip: the sections that actually appear in today's edition —
  // never a fixed list, so the strip cannot advertise a section the day has
  // no stories in. Picking one filters the list below; "Latest" clears it.
  const sections = Array.from(
    new Map(
      articles
        .map((a) => a.category)
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => [c.slug, c])
    ).values()
  );

  // The rows under the lead. Unfiltered they are the stories the hero block
  // did not already print (the lead and its four side-heads); filtered they
  // are the whole section, because a reader who taps "Korea" wants Korea's
  // stories and not "Korea, minus the four already shown above".
  const listArticles = section
    ? articles.filter((a) => a.category?.slug === section)
    : rest;
  const listHeading = section
    ? sections.find((c) => c.slug === section)?.label ?? "Stories"
    : "More Top Stories";

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
          {[{ slug: null, label: "Latest" }, ...sections].map((entry) => {
            const active = entry.slug === section;
            return (
              <button
                key={entry.slug ?? "latest"}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSection(entry.slug);
                  // The strip sits above the fold and the list it filters sits
                  // below it, so a tap that only changed the rows would look
                  // like it did nothing.
                  listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{
                  border: "none",
                  background: "none",
                  padding: "0 0 4px",
                  cursor: "pointer",
                  fontFamily: DISPLAY,
                  fontSize: 12,
                  fontWeight: active ? 700 : 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: active ? "var(--ink-strong)" : "var(--ink-muted)",
                  borderBottom: active ? "2px solid var(--ink-strong)" : "2px solid transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <OnboardingRule />

        {!edition || !lead || !leadVersion ? (
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
                    href={`/article/${lead.slug}?level=${leadVersion.level}`}
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

            <div ref={listRef} style={{ scrollMarginTop: 12 }}>
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
                    {listHeading}
                  </h2>
                  <Link
                    href="/archive"
                    style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--action)" }}
                  >
                    전체 보기
                  </Link>
                </div>

                {listArticles.length === 0 ? (
                  <p
                    style={{
                      margin: "16px 0 0",
                      fontFamily: "var(--font-ui)",
                      fontSize: 12.5,
                      color: "var(--ink-muted)",
                    }}
                  >
                    오늘은 이 섹션에 실린 기사가 없어요.
                  </p>
                ) : (
                  listArticles.map((article, i) => (
                    <StoryRow
                      key={article.id}
                      article={article}
                      level={level}
                      last={i === listArticles.length - 1}
                    />
                  ))
                )}
              </>
            </div>
          </>
        )}
      </div>

      <NewsprintTabBar />
    </div>
  );
}

/**
 * The level-diagnosis nudge, set as a house notice.
 *
 * The standard skin carries `OnboardingBanner` at the top of home; the paper
 * carried nothing, and /settings had no link either — so short of typing
 * /onboarding into the address bar there was no way to reach the level test
 * at all, and every new reader stayed on the A2 default forever.
 *
 * Same policy as the standard banner (design-decisions.md §4.6): never
 * forced, dismissible for good, gone once onboarding is done.
 */
function OnboardingRule() {
  const { session, refresh, hydrated } = useSession();
  if (!hydrated) return null;
  if (session.hasOnboarded() || session.hasDismissedOnboardingBanner()) return null;

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "12px 0 0",
        border: "1px solid var(--rule)",
        padding: "9px 11px",
      }}
    >
      <Link
        href="/onboarding"
        style={{
          flex: 1,
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontStretch: "80%",
          fontSize: 13,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--ink-strong)",
          textDecoration: "none",
        }}
      >
        1분 레벨 진단하기 →
      </Link>
      <button
        type="button"
        onClick={() => {
          session.dismissOnboardingBanner();
          refresh();
        }}
        aria-label="배너 닫기"
        style={{
          border: "none",
          background: "none",
          padding: "4px 2px",
          cursor: "pointer",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          lineHeight: 1,
          color: "var(--ink-muted)",
        }}
      >
        <span aria-hidden>✕</span>
      </button>
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
          textWrap: "balance",
          color: "var(--ink-strong)",
        }}
      >
        {/* The banner is the way into the story — a reader taps the headline
            long before finding "이어서 읽기" at the foot of the block. */}
        <Link
          href={`/article/${article.slug}?level=${version.level}`}
          style={{ color: "inherit", textDecoration: "none" }}
        >
          {version.title}
        </Link>
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
