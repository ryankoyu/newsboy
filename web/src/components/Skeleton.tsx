/** Shimmer skeleton block. a3-ui-ux.md §3-4. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = "var(--r-sm)",
  style,
}: {
  width?: string | number;
  height?: string | number;
  radius?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className="briefly-skeleton"
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        background: "var(--color-surface-alt)",
        ...style,
      }}
    />
  );
}

export function ArticleCardSkeleton() {
  return (
    <div
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--r-md)",
        padding: "var(--sp-4)",
        border: "1px solid var(--color-border)",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Skeleton width={90} height={13} />
        <Skeleton width={60} height={13} />
      </div>
      <Skeleton width="90%" height={20} />
      <Skeleton width="60%" height={20} />
      <Skeleton width="70%" height={14} />
    </div>
  );
}
