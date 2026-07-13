"use client";

import { useState } from "react";
import Link from "next/link";
import type { EditionWithArticles } from "@/lib/types";
import type { SavedSentenceEntry, SavedWordEntry } from "@/lib/session";
import { useSession } from "@/lib/useSession";
import { ArticleCard } from "@/components/ArticleCard";
import { EmptyState } from "@/components/EmptyState";
import { LevelBadge } from "@/components/LevelBadge";
import { stripParenthetical } from "@/lib/wordMatcher";

/**
 * My page — design-decisions.md §4.7. Expands the former "Saved" tab into a
 * profile summary + 3 drawers (스크랩/단어장/문장). Route stays /saved (bottom
 * tab label is now "My" — see AppNav.tsx); the task explicitly allows keeping
 * the route while relabeling the tab.
 *
 * NOTE (same caveat as the previous SavedView): with the seed provider we can
 * only resolve bookmarks/sentences against the latest edition's articles —
 * acceptable at MVP where only one edition exists.
 */
type DrawerKey = "scrap" | "vocab" | "sentence";

export function MyView({ edition }: { edition: EditionWithArticles | null }) {
  const { session, refresh } = useSession();
  const [drawer, setDrawer] = useState<DrawerKey>("scrap");

  const level = session.getLevel();
  const displayName = session.getDisplayName();
  const bookmarks = session.getBookmarks();
  const savedWords = session.getSavedWords();
  const savedSentences = session.getSavedSentences();
  const readCount = session.getReadArticles().length;

  const articles = edition?.articles ?? [];
  const scrappedArticles = articles.filter((a) => bookmarks.includes(a.id));

  function findArticle(articleId: string) {
    return articles.find((a) => a.id === articleId) ?? null;
  }

  const drawers: { key: DrawerKey; label: string; count: number }[] = [
    { key: "scrap", label: "스크랩", count: scrappedArticles.length },
    { key: "vocab", label: "단어장", count: savedWords.length },
    { key: "sentence", label: "문장", count: savedSentences.length },
  ];

  return (
    <main
      style={{
        maxWidth: "var(--content-max)",
        margin: "0 auto",
        padding: "var(--sp-4)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h2)",
          margin: "var(--sp-2) 0 var(--sp-5)",
          color: "var(--color-text)",
        }}
      >
        My
      </h1>

      {/* Profile summary — a3 mood: card surface, level badge, 4 stats. */}
      <section
        aria-label="프로필 요약"
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--r-md)",
          boxShadow: "var(--shadow-card)",
          padding: "var(--sp-5)",
          marginBottom: "var(--sp-6)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)", marginBottom: "var(--sp-4)" }}>
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--r-pill)",
              background: "var(--color-accent-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            ☕
          </span>
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                fontWeight: 700,
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              {displayName ?? "게스트"}
            </p>
            <div style={{ marginTop: 4 }}>
              <LevelBadge level={level} />
            </div>
          </div>
        </div>

        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "var(--sp-2)",
            margin: 0,
          }}
        >
          <StatItem label="읽은 기사" value={readCount} />
          <StatItem label="스크랩" value={scrappedArticles.length} />
          <StatItem label="단어" value={savedWords.length} />
          <StatItem label="문장" value={savedSentences.length} />
        </dl>
      </section>

      {/* Drawer tabs */}
      <div
        role="tablist"
        aria-label="My 서랍"
        className="briefly-hscroll"
        style={{
          gap: "var(--sp-2)",
          marginBottom: "var(--sp-5)",
          background: "var(--color-surface-alt)",
          borderRadius: "var(--r-pill)",
          padding: 4,
        }}
      >
        {drawers.map((d) => {
          const active = drawer === d.key;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setDrawer(d.key)}
              style={{
                flex: 1,
                minWidth: "fit-content",
                padding: "var(--sp-2) var(--sp-4)",
                borderRadius: "var(--r-pill)",
                border: "none",
                background: active ? "var(--color-surface)" : "transparent",
                boxShadow: active ? "var(--shadow-card)" : "none",
                color: active ? "var(--color-accent)" : "var(--color-text-muted)",
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                fontWeight: active ? 700 : 500,
                whiteSpace: "nowrap",
              }}
            >
              {d.label} {d.count > 0 && `(${d.count})`}
            </button>
          );
        })}
      </div>

      {drawer === "scrap" && (
        <ScrapDrawer articles={scrappedArticles} />
      )}

      {drawer === "vocab" && (
        <VocabDrawer
          words={savedWords}
          onRemove={(w) => {
            session.toggleSavedWord(w);
            refresh();
          }}
        />
      )}

      {drawer === "sentence" && (
        <SentenceDrawer
          sentences={savedSentences}
          findArticle={findArticle}
          onRemove={(s) => {
            session.toggleSavedSentence(s);
            refresh();
          }}
        />
      )}
    </main>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <dt
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-xs)",
          color: "var(--color-text-muted)",
          margin: 0,
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h3)",
          fontWeight: 700,
          color: "var(--color-text)",
          margin: 0,
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function ScrapDrawer({ articles }: { articles: EditionWithArticles["articles"] }) {
  if (articles.length === 0) {
    return (
      <EmptyState
        emoji="🔖"
        title="아직 스크랩한 기사가 없어요."
        description="기사 상단의 🔖 로 기사를 저장해보세요."
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}
    </div>
  );
}

function VocabDrawer({
  words,
  onRemove,
}: {
  words: SavedWordEntry[];
  onRemove: (w: SavedWordEntry) => void;
}) {
  if (words.length === 0) {
    return (
      <EmptyState
        emoji="📖"
        title="아직 저장한 단어가 없어요."
        description="기사에서 단어를 눌러 단어장에 저장해보세요."
      />
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-md)",
      }}
    >
      {words.map((w) => {
        const isPhrase = stripParenthetical(w.term).trim().includes(" ");
        return (
          <li
            key={w.term}
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "var(--sp-3)",
              padding: "var(--sp-3) var(--sp-4)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <span style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-2)", minWidth: 0, flexWrap: "wrap" }}>
              {isPhrase && (
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 700,
                    color: "var(--color-accent)",
                    background: "var(--color-accent-soft)",
                    borderRadius: "var(--r-pill)",
                    padding: "1px var(--sp-2)",
                  }}
                >
                  표현
                </span>
              )}
              <span
                lang="en"
                style={{
                  fontFamily: "var(--font-en)",
                  fontSize: "var(--fs-ui)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                {w.term}
              </span>
              <span
                lang="ko"
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-sm)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {w.meaning_ko}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemove(w)}
              aria-label={`${w.term} 단어장에서 제거`}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-sm)",
                padding: "var(--sp-1) var(--sp-2)",
                flexShrink: 0,
              }}
            >
              삭제
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SentenceDrawer({
  sentences,
  findArticle,
  onRemove,
}: {
  sentences: SavedSentenceEntry[];
  findArticle: (articleId: string) => EditionWithArticles["articles"][number] | null;
  onRemove: (s: SavedSentenceEntry) => void;
}) {
  if (sentences.length === 0) {
    return (
      <EmptyState
        emoji="📝"
        title="아직 저장한 문장이 없어요."
        description="기사 본문에서 문장을 눌러 저장해보세요."
      />
    );
  }

  const sorted = [...sentences].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      {sorted.map((s) => {
        const article = findArticle(s.articleId);
        return (
          <li
            key={`${s.articleId}-${s.level}-${s.sentenceIndex}`}
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--r-md)",
              padding: "var(--sp-4)",
            }}
          >
            <p
              lang="en"
              style={{
                fontFamily: "var(--font-en)",
                fontSize: "var(--fs-ui)",
                lineHeight: "var(--lh-ui)",
                color: "var(--color-text)",
                margin: "0 0 var(--sp-3)",
              }}
            >
              &ldquo;{s.text}&rdquo;
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--sp-2)",
              }}
            >
              {article ? (
                <Link
                  href={`/article/${article.slug}?level=${s.level}`}
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--fs-sm)",
                    color: "var(--color-link)",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-2)",
                  }}
                >
                  <LevelBadge level={s.level} />
                  <span>{article.versions.find((v) => v.level === s.level)?.title ?? "기사 보기"}</span>
                </Link>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--fs-sm)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <LevelBadge level={s.level} /> 원본 기사를 찾을 수 없어요.
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(s)}
                aria-label="저장한 문장 삭제"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-sm)",
                  padding: "var(--sp-1) var(--sp-2)",
                  flexShrink: 0,
                }}
              >
                삭제
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
