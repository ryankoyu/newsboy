/**
 * Quiet "3/10" today-progress indicator — enhancement-plan.md Batch 1 #2.
 * Sits near the level switcher in the article viewer header. Deliberately
 * understated (no progress bar animation, no color urgency) per the task's
 * "조용하게" instruction.
 */
export function TodayProgress({ readCount, total }: { readCount: number; total: number }) {
  if (total <= 0) return null;
  return (
    <span
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-sm)",
        color: "var(--color-text-muted)",
        whiteSpace: "nowrap",
      }}
      aria-label={`오늘의 브리핑 진행 ${readCount} / ${total}`}
    >
      {readCount}/{total}
    </span>
  );
}
