"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { computeWeeklyBrief } from "@/lib/weeklyBrief";

/**
 * "오늘의 브리핑 끝!" completion card — enhancement-plan.md Batch 1 #3.
 * Shown at the end of the article body once ALL of today's edition
 * articles are read (see ArticleViewer — replaces the NextArticleCard on
 * the last-ranked article). Tone is deliberately light: no missed-day
 * callouts, no red/warning colors, streak framed as a count, not a
 * countdown to losing it.
 */
export function BriefCompleteCard({ totalToday }: { totalToday: number }) {
  const { session, hydrated } = useSession();

  const stats = useMemo(() => {
    if (!hydrated) return null;
    return computeWeeklyBrief({
      readEvents: session.getReadEvents(),
      savedWords: session.getSavedWords(),
      savedSentences: session.getSavedSentences(),
    });
  }, [hydrated, session]);

  const todaySavedWords = useMemo(() => {
    if (!hydrated) return 0;
    const today = new Date().toDateString();
    return session
      .getSavedWords()
      .filter((w) => w.savedAt && new Date(w.savedAt).toDateString() === today).length;
  }, [hydrated, session]);
  const todaySavedSentences = useMemo(() => {
    if (!hydrated) return 0;
    const today = new Date().toDateString();
    return session
      .getSavedSentences()
      .filter((s) => new Date(s.savedAt).toDateString() === today).length;
  }, [hydrated, session]);

  return (
    <section
      role="status"
      aria-label="오늘의 브리핑 완주"
      style={{
        marginTop: "var(--sp-8)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-pop)",
        padding: "var(--sp-6) var(--sp-5)",
        textAlign: "center",
      }}
    >
      <span aria-hidden style={{ fontSize: 32 }}>
        ☕✅
      </span>
      <h2
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h2)",
          color: "var(--color-text)",
          margin: "var(--sp-3) 0 var(--sp-1)",
        }}
      >
        오늘의 브리핑 끝!
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          color: "var(--color-text-secondary)",
          margin: "0 0 var(--sp-5)",
        }}
      >
        오늘 {totalToday}개 기사를 모두 읽었어요
        {todaySavedWords + todaySavedSentences > 0 && (
          <>
            {" "}
            · 단어 {todaySavedWords}개, 문장 {todaySavedSentences}개를 새로 담았어요
          </>
        )}
      </p>

      {stats && (
        <div
          style={{
            background: "var(--color-surface-alt)",
            borderRadius: "var(--r-md)",
            padding: "var(--sp-4)",
            textAlign: "left",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-ui)",
              fontWeight: 700,
              color: "var(--color-text)",
              margin: "0 0 var(--sp-3)",
            }}
          >
            📅 나의 주간 브리핑
          </h3>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "var(--sp-2)",
              margin: "0 0 var(--sp-3)",
            }}
          >
            <WeeklyStat label="읽은 기사" value={stats.articlesRead} />
            <WeeklyStat label="새 단어" value={stats.wordsSaved} />
            <WeeklyStat label="저장 문장" value={stats.sentencesSaved} />
          </dl>
          {stats.streakDays > 0 && (
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-sm)",
                color: "var(--color-text-secondary)",
                margin: 0,
              }}
            >
              <span aria-hidden>🔥</span> {stats.streakDays}일 연속으로 브리핑을 읽고 있어요.
            </p>
          )}
        </div>
      )}

      <Link
        href="/"
        style={{
          display: "inline-block",
          marginTop: "var(--sp-5)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          fontWeight: 600,
          color: "var(--color-accent)",
          textDecoration: "none",
        }}
      >
        홈으로 →
      </Link>
    </section>
  );
}

function WeeklyStat({ label, value }: { label: string; value: number }) {
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
