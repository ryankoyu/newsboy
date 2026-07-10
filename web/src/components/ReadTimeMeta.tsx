/** Reading time meta — clock icon + "N min". a3-ui-ux.md §1-4. */
export function ReadTimeMeta({ minutes }: { minutes: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--sp-1)",
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-sm)",
        color: "var(--color-text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>⏱</span>
      <span>{minutes} min</span>
    </span>
  );
}
