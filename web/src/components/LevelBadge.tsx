import type { CefrLevel } from "@/lib/types";

/**
 * Level badge — a3-ui-ux.md §1-4 "배지(레벨/카테고리/읽기시간)".
 * Color communicates level, but text (A2/B1/B2) is always present
 * (accessibility §4-1 — never color-only).
 */
export function LevelBadge({ level }: { level: CefrLevel }) {
  const bg = `var(--level-${level.toLowerCase()}-bg)`;
  const fg = `var(--level-${level.toLowerCase()}-fg)`;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "var(--r-pill)",
        padding: "2px var(--sp-2)",
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-xs)",
        fontWeight: 700,
        letterSpacing: "0.02em",
        background: bg,
        color: fg,
      }}
    >
      {level}
    </span>
  );
}
