"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ArticleWithDetails, CefrLevel, EditionWithArticles, Word } from "@/lib/types";
import { estimateReadingMinutes } from "@/lib/data";
import { useSession, notifySessionChange } from "@/lib/useSession";
import { READING_SCALE_VALUE, sessionStore } from "@/lib/session";
import { countUniqueOutlets } from "@/lib/sourceOutlets";
import { groupSourcesByOutlet } from "@/lib/sourceOutlets";
import { isEditionPast, formatPastEditionLabel } from "@/lib/editionDate";
import { computeWeeklyBrief } from "@/lib/weeklyBrief";
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
import { BackIcon, BookmarkIcon } from "@/components/newsprint/icons";

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
 * standard `ArticleViewer` — this is a re-skin, not a re-spec. That cuts both
 * ways: everything the standard reader gives a reader has to be reachable
 * here too, because light mode IS this skin (useNewsprintSkin) and a feature
 * missing from the paper is a feature missing from the product. The word
 * index, today's progress, the completion block, the past-edition line and
 * the provenance link are all set in type below for that reason.
 */

const DISPLAY = "var(--font-display), Georgia, serif";

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
  const { session, refresh } = useSession();
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
        // Without this the store changes and nothing re-renders: today's
        // progress would sit one article behind, and the completion block on
        // the last article would only appear after a reload.
        notifySessionChange();
      }
    }

    window.addEventListener("scroll", maybeMark, { passive: true });
    const timer = window.setInterval(maybeMark, 5000);
    return () => {
      window.removeEventListener("scroll", maybeMark);
      window.clearInterval(timer);
    };
  }, [article.id]);

  // An article with no version at all cannot be typeset — say so rather than
  // dereferencing undefined and taking the whole page down with it. Placed
  // after every hook, so the hook order never changes between renders.
  if (!version) {
    return (
      <div style={{ display: "flex", justifyContent: "center", background: "var(--paper-desk)" }}>
        <div className="np-paper" style={{ width: 430, maxWidth: "100%", padding: "40px 18px" }}>
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13.5,
              textAlign: "center",
              color: "var(--ink-muted)",
            }}
          >
            이 기사의 레벨 버전을 찾을 수 없습니다.
          </p>
        </div>
      </div>
    );
  }

  const minutes = estimateReadingMinutes(version.level as CefrLevel, version.word_count);
  const words = wordsByVersion[version.id] ?? [];
  const outlets = groupSourcesByOutlet(article.sources);

  const rankedArticles = [...(edition?.articles ?? [])].sort(
    (a, b) => (a.rank_in_edition ?? 0) - (b.rank_in_edition ?? 0)
  );
  const currentIndex = rankedArticles.findIndex((a) => a.id === article.id);
  const nextArticle = currentIndex >= 0 ? rankedArticles[currentIndex + 1] ?? null : null;
  const isLastInEdition = currentIndex >= 0 && currentIndex === rankedArticles.length - 1;
  const readArticleIds = new Set(session.getReadArticles());
  const readCountToday = rankedArticles.filter((a) => readArticleIds.has(a.id)).length;
  const allReadToday =
    rankedArticles.length > 0 && rankedArticles.every((a) => readArticleIds.has(a.id));
  const briefComplete = isLastInEdition && allReadToday;
  const isPastEdition = Boolean(edition && isEditionPast(edition.edition_date));
  const saved = session.isBookmarked(article.id);
  // Only the day's lead carries an engraving (chrome.tsx `Cut`). Opened
  // without its edition — a direct link, a shared URL — there is nothing to
  // compare against, so the page sets in type rather than guessing.
  const isLead = rankedArticles.length > 0 && rankedArticles[0]?.id === article.id;
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

        {/* A back number has to say so on its own face — the folio date above
            is set in English furniture, which is not a warning. */}
        {isPastEdition && edition && (
          <p
            style={{
              margin: "8px 0 0",
              textAlign: "center",
              fontFamily: "var(--font-ui)",
              fontSize: 11.5,
              color: "var(--ink-muted)",
            }}
          >
            {formatPastEditionLabel(edition.edition_date)} 브리핑
          </p>
        )}

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

        {isLead && (
          <Cut
            articleId={article.id}
            height={220}
            label={"ENGRAVING\n1200×880\n기사 삽화"}
            caption={article.category?.label ?? undefined}
          />
        )}

        {/* ── Level switcher. An app control, so it keeps Newsboy's look. ──
            Today's progress sits beside it, exactly where the standard reader
            puts it — quiet, no bar, no urgency. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: rankedArticles.length > 0 ? "space-between" : "center",
            gap: 12,
            margin: "16px 0 0",
          }}
        >
          <LevelSwitcher value={level} onChange={handleLevelChange} />
          {rankedArticles.length > 0 && (
            <span
              aria-label={`오늘의 브리핑 진행 ${readCountToday} / ${rankedArticles.length}`}
              style={{
                fontFamily: DISPLAY,
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                color: "var(--ink-muted)",
              }}
            >
              {readCountToday} / {rankedArticles.length}
            </span>
          )}
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

        <WordIndex words={words} />

        {outlets.length > 0 && (
          <RuledBox head="Sources">
            {/* The trust notice the standard skin prints above its source
                list (enhancement-plan.md Batch 1 #1). It is the one claim the
                product makes about itself, and /about is the only place that
                explains it — leaving both off the paper left the default
                reader with no way to check either. */}
            <p
              style={{
                margin: "0 0 10px",
                paddingBottom: 9,
                borderBottom: "1px solid var(--rule-hair)",
                fontFamily: "var(--font-ui)",
                fontSize: 11.5,
                lineHeight: 1.6,
                color: "var(--ink-muted)",
              }}
            >
              이 기사는 {outlets.length}개 매체에서 교차 확인된 사실을 바탕으로 새로
              작성되었습니다.{" "}
              <Link href="/about" style={{ color: "var(--action)", textDecoration: "none" }}>
                우리가 뉴스를 만드는 방법 →
              </Link>
            </p>
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

        {/* The completion block replaces the jump line once every article in
            today's brief is read and this is the last of them — it is the ONLY
            way into the weekly brief and the streak, so a paper without it is
            a product with the feature switched off. */}
        {briefComplete && <BriefCompleteBlock totalToday={rankedArticles.length} />}

        {!briefComplete && nextArticle && nextVersion && (
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

      {/* ── Foot bar. Sits on paper, so it takes --paper-tabbar. ──
          The handoff draws three columns: 듣기 / 저장 / 더보기. Only one of
          them is a thing this app can do — there is no text-to-speech in the
          codebase and no overflow menu — so the bar carries the save action
          alone rather than printing two buttons that do nothing. */}
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
            display: "flex",
            justifyContent: "center",
            borderTop: "2px solid var(--rule-strong)",
            background: "var(--paper-tabbar)",
            padding: "11px 0 16px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              session.toggleBookmark(article.id);
              refresh();
            }}
            aria-pressed={saved}
            aria-label={saved ? "저장 취소" : "저장"}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              minWidth: 96,
              minHeight: 44,
              border: "none",
              background: "none",
              padding: "0 20px",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: saved ? "var(--action)" : "var(--ink)",
            }}
          >
            {/* The flag inks solid when saved, so the state does not rest on
                colour alone. */}
            <BookmarkIcon size={18} filled={saved} />
            {saved ? "저장됨" : "저장"}
          </button>
        </div>
      </nav>
    </div>
  );
}

/**
 * "Words in this Story", set as a ruled index.
 *
 * The standard reader ends with `WordListSection`; the paper printed only a
 * count in the meta line, which meant the day's vocabulary was reachable only
 * by finding each word inside the justified body. Each entry can be taken
 * into the wordbook from here, the same toggle the inline dictionary uses.
 *
 * Nothing is invented: a word with no gloss says so, exactly as the panel and
 * My Index do.
 */
function WordIndex({ words }: { words: Word[] }) {
  const { session, refresh } = useSession();
  if (words.length === 0) return null;

  return (
    <RuledBox head={`Words in This Story (${words.length})`}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {words.map((word, i) => {
          const saved = session.isWordSaved(word.term);
          return (
            <li
              key={word.id}
              style={{
                padding: i === 0 ? "0 0 9px" : "9px 0",
                borderBottom: i === words.length - 1 ? undefined : "1px solid var(--rule-hair)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  lang="en"
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 800,
                    fontStretch: "82%",
                    fontSize: 16,
                    color: "var(--ink-strong)",
                  }}
                >
                  {word.term}
                </span>
                {word.pronunciation && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--ink-muted)",
                    }}
                  >
                    {word.pronunciation}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => {
                    session.toggleSavedWord({
                      term: word.term,
                      meaning_ko: word.meaning_ko ?? null,
                      savedAt: new Date().toISOString(),
                    });
                    refresh();
                  }}
                  aria-pressed={saved}
                  aria-label={`${word.term} ${saved ? "단어장에서 빼기" : "단어장 담기"}`}
                  style={{
                    border: "none",
                    background: "none",
                    padding: 0,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    color: "var(--action)",
                  }}
                >
                  {saved ? "빼기" : "담기"}
                </button>
              </div>
              <p
                style={{
                  margin: "3px 0 0",
                  fontFamily: "var(--font-ui)",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: word.meaning_ko ? "var(--ink)" : "var(--ink-muted)",
                }}
              >
                {word.meaning_ko
                  ? `${word.pos ? `${word.pos} ` : ""}${word.meaning_ko}`
                  : "뜻 준비 중"}
              </p>
            </li>
          );
        })}
      </ul>
    </RuledBox>
  );
}

/**
 * The end-of-brief block — the newsprint setting of `BriefCompleteCard`.
 *
 * Same data and the same deliberately light tone (a count, never a countdown
 * to losing it), typeset instead of carded: the standard card's radius,
 * shadow and emoji are three things the paper does not take.
 */
function BriefCompleteBlock({ totalToday }: { totalToday: number }) {
  const { session, hydrated } = useSession();

  const stats = useMemo(() => {
    if (!hydrated) return null;
    return computeWeeklyBrief({
      readEvents: session.getReadEvents(),
      savedWords: session.getSavedWords(),
      savedSentences: session.getSavedSentences(),
    });
  }, [hydrated, session]);

  return (
    <section
      role="status"
      aria-label="오늘의 브리핑 완주"
      style={{ margin: "18px 0 0", border: "3px double var(--rule-strong)", padding: "16px 16px 18px" }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontStretch: "72%",
          fontSize: 26,
          lineHeight: 1.05,
          letterSpacing: "0.02em",
          textAlign: "center",
          textTransform: "uppercase",
          color: "var(--ink-strong)",
        }}
      >
        오늘의 브리핑 끝!
      </h2>
      <p
        style={{
          margin: "9px 0 0",
          textAlign: "center",
          fontFamily: "var(--font-ui)",
          fontSize: 12.5,
          color: "var(--ink-soft)",
        }}
      >
        오늘 {totalToday}개 기사를 모두 읽었어요
      </p>

      <Ornament margin="13px 0 0" />

      {stats && (
        <>
          <h3
            style={{
              margin: "13px 0 0",
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontStretch: "74%",
              fontSize: 12,
              letterSpacing: "0.13em",
              textTransform: "uppercase",
              textAlign: "center",
              color: "var(--ink)",
            }}
          >
            나의 주간 브리핑
          </h3>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              margin: "10px 0 0",
            }}
          >
            <WeeklyStat label="읽은 기사" value={stats.articlesRead} />
            <WeeklyStat label="새 단어" value={stats.wordsSaved} />
            <WeeklyStat label="저장 문장" value={stats.sentencesSaved} />
          </dl>
          {stats.streakDays > 0 && (
            <p
              style={{
                margin: "11px 0 0",
                textAlign: "center",
                fontFamily: "var(--font-ui)",
                fontSize: 11.5,
                color: "var(--ink-muted)",
              }}
            >
              {stats.streakDays}일 연속으로 브리핑을 읽고 있어요.
            </p>
          )}
        </>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "14px 0 0" }}>
        <div style={{ flex: 1, height: 1, background: "var(--rule-hair)" }} />
        <Link
          href="/"
          style={{ fontFamily: "var(--font-ui)", fontSize: 11.5, color: "var(--action)" }}
        >
          홈으로 →
        </Link>
        <div style={{ flex: 1, height: 1, background: "var(--rule-hair)" }} />
      </div>
    </section>
  );
}

function WeeklyStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "8px 4px 7px", textAlign: "center" }}>
      <dt
        style={{
          margin: 0,
          fontFamily: "var(--font-ui)",
          fontSize: 10.5,
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          margin: "3px 0 0",
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontStretch: "76%",
          fontSize: 22,
          lineHeight: 1,
          color: "var(--ink-strong)",
        }}
      >
        {value}
      </dd>
    </div>
  );
}
