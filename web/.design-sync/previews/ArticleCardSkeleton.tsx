import { ArticleCardSkeleton } from "@/components/Skeleton";

/** What the home feed shows while the edition loads — three in a stack,
 *  matching the real ArticleCard rhythm. */
export const HomeFeedLoading = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "var(--sp-3)",
      maxWidth: 420,
      padding: "var(--sp-4)",
      background: "var(--color-bg)",
    }}
  >
    <ArticleCardSkeleton />
    <ArticleCardSkeleton />
    <ArticleCardSkeleton />
  </div>
);

/** A single placeholder card on its own. */
export const Single = () => (
  <div style={{ maxWidth: 420, padding: "var(--sp-4)", background: "var(--color-bg)" }}>
    <ArticleCardSkeleton />
  </div>
);
