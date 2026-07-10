"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/useSession";

/**
 * Theme toggle — stamps <html data-theme="dark|light"> per
 * a3-ui-ux.md §0 implementation note. "system" removes the attribute so
 * @media(prefers-color-scheme) takes over.
 */
export function ThemeToggle() {
  const { session, refresh, hydrated } = useSession();
  const theme = session.getTheme();

  useEffect(() => {
    // Wait for hydration: before it, `theme` is the fallback "system" and
    // acting on it would wipe the data-theme the head script already set.
    if (!hydrated) return;
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme, hydrated]);

  function toggle() {
    // Simple two-state toggle for the header icon: light <-> dark.
    // "system" is available explicitly in Settings.
    const current = session.getTheme();
    const isDark =
      current === "dark" ||
      (current === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    session.setTheme(isDark ? "light" : "dark");
    refresh();
  }

  // Gate matchMedia on `hydrated` so the hydration render matches SSR HTML.
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      hydrated &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      style={{
        width: 44,
        height: 44,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        border: "none",
        borderRadius: "var(--r-sm)",
        fontSize: 20,
        color: "var(--color-text)",
      }}
    >
      <span aria-hidden>{isDark ? "🌙" : "☀️"}</span>
    </button>
  );
}
