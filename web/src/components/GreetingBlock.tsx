"use client";

import type { CefrLevel } from "@/lib/types";
import { useSession } from "@/lib/useSession";

/**
 * Time-of-day greeting + date + brief summary line.
 * a3-ui-ux.md §2-1, §3-4 ("인사말 시간대").
 *
 * Greeting is computed from the user's LOCAL clock, so it renders a neutral
 * fallback during SSR/hydration (hydrated=false) and settles into the real
 * greeting on the post-hydration re-render (see useSession).
 */
function greetingFor(hour: number): string {
  if (hour >= 5 && hour <= 11) return "Good Morning";
  if (hour >= 12 && hour <= 17) return "Good Afternoon";
  return "Good Evening";
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function GreetingBlock({
  totalArticles,
  totalMinutes,
}: {
  totalArticles: number;
  totalMinutes: number;
}) {
  const { session, hydrated } = useSession();
  // Local clock is only trustworthy for greeting once we're past hydration
  // (server clock/timezone may differ from the user's).
  const now = hydrated ? new Date() : null;

  const name = session.getDisplayName();
  const level: CefrLevel = session.getLevel();
  const greeting = now ? greetingFor(now.getHours()) : "Good Morning";
  const dateStr = now ? formatDate(now) : "";

  return (
    <div style={{ marginBottom: "var(--sp-6)" }}>
      <h1
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-display)",
          lineHeight: "var(--lh-display)",
          margin: 0,
          color: "var(--color-text)",
        }}
      >
        {greeting}
        {name ? `, ${name}` : ""}. <span aria-hidden>{greeting === "Good Morning" ? "☀️" : greeting === "Good Evening" ? "🌙" : "☀️"}</span>
      </h1>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          color: "var(--color-text-secondary)",
          margin: "var(--sp-1) 0 var(--sp-5)",
          minHeight: "1.5em",
        }}
      >
        {dateStr}
      </p>

      <h2
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h2)",
          margin: "0 0 var(--sp-1)",
          color: "var(--color-text)",
        }}
      >
        Your Daily Brief
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          color: "var(--color-text-secondary)",
          margin: "0 0 var(--sp-2)",
        }}
      >
        오늘 꼭 알아야 할 뉴스 {totalArticles}개
      </p>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-sm)",
          color: "var(--color-text-muted)",
          margin: 0,
        }}
      >
        <span aria-hidden>⏱</span> 약 {totalMinutes}분 · 레벨 {level}
      </p>
    </div>
  );
}
