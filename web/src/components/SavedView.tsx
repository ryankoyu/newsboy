"use client";

import type { EditionWithArticles } from "@/lib/types";
import { useSession } from "@/lib/useSession";
import { ArticleCard } from "@/components/ArticleCard";
import { EmptyState } from "@/components/EmptyState";

/**
 * Saved tab — bookmarked articles + saved words.
 * Empty states per a3-ui-ux.md §3-4.
 *
 * NOTE: with the seed provider we can only resolve bookmarks against the
 * latest edition's articles (there is no getArticleById-across-editions in
 * DataProvider). Bookmarks referencing older editions simply won't resolve —
 * acceptable at MVP where only one edition exists.
 */
export function SavedView({ edition }: { edition: EditionWithArticles | null }) {
  const { session, refresh } = useSession();
  const bookmarks = session.getBookmarks();
  const savedWords = session.getSavedWords();

  const articles = (edition?.articles ?? []).filter((a) => bookmarks.includes(a.id));
  const empty = articles.length === 0 && savedWords.length === 0;

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
        Saved
      </h1>

      {empty && (
        <EmptyState
          emoji="🔖"
          title="아직 저장한 것이 없어요."
          description="기사 상단의 🔖 로 기사를 저장하고, 기사에서 단어를 눌러 단어를 저장해보세요."
        />
      )}

      {articles.length > 0 && (
        <section aria-label="저장한 기사" style={{ marginBottom: "var(--sp-8)" }}>
          <h2
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-h3)",
              margin: "0 0 var(--sp-3)",
              color: "var(--color-text-secondary)",
            }}
          >
            저장한 기사
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
            {articles.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      )}

      {savedWords.length > 0 && (
        <section aria-label="저장한 단어">
          <h2
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-h3)",
              margin: "0 0 var(--sp-3)",
              color: "var(--color-text-secondary)",
            }}
          >
            저장한 단어
          </h2>
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
            {savedWords.map((w) => (
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
                <span style={{ display: "flex", alignItems: "baseline", gap: "var(--sp-3)", minWidth: 0 }}>
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
                  onClick={() => {
                    session.toggleSavedWord(w);
                    refresh();
                  }}
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
                  제거
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
