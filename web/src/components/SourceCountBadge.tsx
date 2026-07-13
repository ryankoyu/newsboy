/**
 * "소스 N" badge — enhancement-plan.md Batch 1 #1 (신뢰 전면화).
 * Deep-teal (--color-link family), consistent with SourcesSection's link
 * color so the "trust" signal reads as one visual language across card,
 * viewer header, and the sources block itself. Never color-only — always
 * paired with the "소스 N" text (§4-1 accessibility rule).
 */
export function SourceCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: "var(--r-pill)",
        padding: "2px var(--sp-2)",
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-xs)",
        fontWeight: 700,
        letterSpacing: "0.02em",
        background: "var(--color-accent-soft)",
        color: "var(--color-link)",
      }}
      title={`${count}개 매체에서 교차 확인된 사실로 작성됨`}
    >
      <span aria-hidden>🔗</span>
      소스 {count}
    </span>
  );
}
