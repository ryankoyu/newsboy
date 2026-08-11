import { Skeleton } from "@/components/Skeleton";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 380, padding: "var(--sp-4)", background: "var(--color-bg)" }}>{children}</div>
);

/** The shimmer primitive at the sizes the loading screens actually use. */
export const Sizes = () => (
  <Frame>
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
      <Skeleton width={120} height={12} />
      <Skeleton width="100%" height={20} />
      <Skeleton width="70%" height={20} />
      <Skeleton width={64} height={24} radius="var(--r-pill)" />
    </div>
  </Frame>
);

/** Composed into a headline-plus-body placeholder. */
export const TextBlock = () => (
  <Frame>
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
      <Skeleton width="90%" height={18} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="96%" height={14} />
      <Skeleton width="55%" height={14} />
    </div>
  </Frame>
);
