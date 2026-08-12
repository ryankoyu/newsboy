"use client";

import { useState } from "react";
import Link from "next/link";
import type { EditionWithArticles } from "@/lib/types";
import type { SavedSentenceEntry, SavedWordEntry } from "@/lib/session";
import { useSession } from "@/lib/useSession";
import { stripParenthetical } from "@/lib/wordMatcher";
import { LevelBadge } from "@/components/LevelBadge";
import { NewsprintTabBar } from "@/components/newsprint/NewsprintTabBar";
import { StoryRow } from "@/components/newsprint/StoryRow";
import { FolioLine, Nameplate } from "@/components/newsprint/chrome";

/**
 * My Index — the newsprint treatment of /saved.
 * design_handoff_newsprint_skin §4 ("Wordbook — mobile").
 *
 * The handoff designs this screen as a word index only, and assumes each
 * saved word carries `{ ipa, example, sourceArticleId, level, mastered }`.
 * This app stores `{ term, meaning_ko, savedAt }` and nothing else, so those
 * five fields are simply not printed — inventing a pronunciation or a
 * "mastered" state would be fabricating user data. What the handoff's layout
 * calls for and the data does support — the stat row, the filter row, date
 * group heads with counts, and the ruled entry rows — is all here.
 *
 * The screen is also broader than the handoff's: /saved holds three drawers
 * (스크랩 / 단어장 / 문장), so the filter row carries those rather than the
 * All / To Review / Mastered the prototype shows, and the nameplate reads
 * "My Index." rather than "Word Index."
 */

const DISPLAY = "var(--font-display), Georgia, serif";

type DrawerKey = "scrap" | "vocab" | "sentence";

export function NewsprintMyView({ edition }: { edition: EditionWithArticles | null }) {
  const { session, refresh } = useSession();
  const [drawer, setDrawer] = useState<DrawerKey>("scrap");

  const level = session.getLevel();
  const displayName = session.getDisplayName();
  const bookmarks = session.getBookmarks();
  const savedWords = session.getSavedWords();
  const savedSentences = session.getSavedSentences();
  const readCount = session.getReadArticles().length;

  const articles = edition?.articles ?? [];
  const scrapped = articles.filter((a) => bookmarks.includes(a.id));

  const drawers: { key: DrawerKey; label: string; count: number }[] = [
    { key: "scrap", label: "Scraps", count: scrapped.length },
    { key: "vocab", label: "Words", count: savedWords.length },
    { key: "sentence", label: "Sentences", count: savedSentences.length },
  ];

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
        <header style={{ textAlign: "center", padding: "18px 2px 10px" }}>
          <div style={{ display: "inline-block" }}>
            <Nameplate size={24} />
          </div>
        </header>

        <div style={{ borderBottom: "3px double var(--rule-strong)", paddingBottom: 6 }}>
          <FolioLine
            dateLabel="Collected"
            right={`${savedWords.length} Words · ${savedSentences.length} Sentences`}
            bordered
          />
        </div>

        {/* ── Stat row: three bordered cells ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, margin: "14px 0 0" }}>
          <StatCell value={readCount} label="읽은 기사" />
          <StatCell value={savedWords.length} label="단어" />
          <StatCell value={savedSentences.length} label="문장" />
        </div>

        {displayName && (
          <p
            style={{
              margin: "10px 0 0",
              textAlign: "center",
              fontFamily: DISPLAY,
              fontSize: 10.5,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--ink-muted)",
            }}
          >
            Kept by {displayName} · Level {level}
          </p>
        )}

        {/* ── Filter row ── */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            margin: "18px 0 0",
            paddingBottom: 0,
            borderBottom: "1px solid var(--rule-hair)",
          }}
        >
          {drawers.map((d) => {
            const active = d.key === drawer;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => setDrawer(d.key)}
                aria-pressed={active}
                style={{
                  border: "none",
                  background: "none",
                  padding: "0 0 5px",
                  fontFamily: DISPLAY,
                  fontSize: 11.5,
                  fontWeight: active ? 800 : 600,
                  letterSpacing: "0.09em",
                  textTransform: "uppercase",
                  color: active ? "var(--ink-strong)" : "var(--ink-muted)",
                  borderBottom: active ? "2px solid var(--ink-strong)" : "2px solid transparent",
                }}
              >
                {d.label} ({d.count})
              </button>
            );
          })}
        </div>

        {drawer === "scrap" && (
          <Drawer empty={scrapped.length === 0} emptyText="아직 스크랩한 기사가 없어요.">
            {scrapped.map((article, i) => (
              <StoryRow
                key={article.id}
                article={article}
                level={level}
                last={i === scrapped.length - 1}
              />
            ))}
          </Drawer>
        )}

        {drawer === "vocab" && (
          <Drawer empty={savedWords.length === 0} emptyText="아직 담아둔 단어가 없어요.">
            {groupByDate(savedWords, (w) => w.savedAt).map(([day, entries]) => (
              <section key={day}>
                <GroupHead label={day} count={entries.length} />
                {entries.map((entry) => (
                  <WordEntry
                    key={entry.term}
                    entry={entry}
                    onRemove={() => {
                      session.toggleSavedWord(entry);
                      refresh();
                    }}
                  />
                ))}
              </section>
            ))}
          </Drawer>
        )}

        {drawer === "sentence" && (
          <Drawer empty={savedSentences.length === 0} emptyText="아직 저장한 문장이 없어요.">
            {groupByDate(savedSentences, (s) => s.savedAt).map(([day, entries]) => (
              <section key={day}>
                <GroupHead label={day} count={entries.length} />
                {entries.map((entry) => (
                  <SentenceEntry
                    key={`${entry.articleId}-${entry.level}-${entry.sentenceIndex}`}
                    entry={entry}
                    slug={articles.find((a) => a.id === entry.articleId)?.slug ?? null}
                    onRemove={() => {
                      session.toggleSavedSentence(entry);
                      refresh();
                    }}
                  />
                ))}
              </section>
            ))}
          </Drawer>
        )}
      </div>

      <NewsprintTabBar />
    </div>
  );
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        padding: "10px 4px 8px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 900,
          fontStretch: "76%",
          fontSize: 26,
          lineHeight: 1,
          color: "var(--ink-strong)",
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          color: "var(--ink-muted)",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Drawer({
  empty,
  emptyText,
  children,
}: {
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (empty) {
    return (
      <p
        style={{
          margin: "34px 0",
          textAlign: "center",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--ink-muted)",
        }}
      >
        {emptyText}
      </p>
    );
  }
  return <div style={{ marginTop: 4 }}>{children}</div>;
}

/** Uppercase date head with a hairline and the group's count. */
function GroupHead({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 2px" }}>
      <span
        style={{
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontStretch: "74%",
          fontSize: 12,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--ink)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--rule-hair)" }} />
      <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faint)" }}>
        {count}
      </span>
    </div>
  );
}

function WordEntry({ entry, onRemove }: { entry: SavedWordEntry; onRemove: () => void }) {
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--rule-hair)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          lang="en"
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontStretch: "82%",
            fontSize: 20,
            color: "var(--ink-strong)",
          }}
        >
          {stripParenthetical(entry.term)}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onRemove}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--action)",
          }}
        >
          빼기
        </button>
      </div>
      <p
        style={{
          margin: "5px 0 0",
          fontFamily: "var(--font-ui)",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: entry.meaning_ko ? "var(--ink)" : "var(--ink-muted)",
        }}
      >
        {/* Never fabricate a meaning for a word saved without one. */}
        {entry.meaning_ko ?? "뜻 미등록"}
      </p>
    </div>
  );
}

/**
 * One saved sentence. The meta row sits OUTSIDE the link to the article —
 * a "빼기" button nested inside an anchor is both invalid markup and a trap
 * for anyone driving this by keyboard.
 */
function SentenceEntry({
  entry,
  slug,
  onRemove,
}: {
  entry: SavedSentenceEntry;
  slug: string | null;
  onRemove: () => void;
}) {
  const text = (
    <p
      lang="en"
      style={{
        margin: 0,
        fontSize: 14,
        lineHeight: 1.6,
        fontStyle: "italic",
        color: "var(--ink)",
      }}
    >
      “{entry.text}”
    </p>
  );

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--rule-hair)" }}>
      {slug ? (
        <Link href={`/article/${slug}?level=${entry.level}`} style={{ textDecoration: "none" }}>
          {text}
        </Link>
      ) : (
        text
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
        <LevelBadge level={entry.level} />
        <span style={{ flex: 1 }} />
        {slug && (
          <Link
            href={`/article/${slug}?level=${entry.level}`}
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--action)",
              textDecoration: "none",
            }}
          >
            원문 보기 →
          </Link>
        )}
        {/* Words had a "빼기" and sentences did not, so a sentence saved by
            mistake stayed in the drawer for good. */}
        <button
          type="button"
          onClick={onRemove}
          aria-label="저장한 문장에서 빼기"
          style={{
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--action)",
          }}
        >
          빼기
        </button>
      </div>
    </div>
  );
}

/**
 * Group entries by their saved date, newest day first. Entries persisted
 * before `savedAt` existed have no timestamp and are collected under
 * "Earlier" rather than being given an invented date.
 */
function groupByDate<T>(entries: T[], at: (e: T) => string | undefined): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const iso = at(e);
    const key = iso ? iso.slice(0, 10) : "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, list]) => [key ? formatGroupDate(key) : "Earlier", list]);
}

function formatGroupDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
