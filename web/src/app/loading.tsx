import { ArticleCardSkeleton } from "@/components/Skeleton";

/**
 * Route-level fallback while a page's data resolves.
 *
 * Card skeletons rather than a spinner: every route under this segment is a
 * list of stories or a single story, so the shape is honest about what is
 * coming (a3-ui-ux.md §3-4). HomeView shows the same skeletons while the
 * client session hydrates, so the two states line up instead of flashing
 * different placeholders at each other.
 */
export default function Loading() {
  return (
    <main
      aria-busy="true"
      style={{ maxWidth: "var(--content-max)", margin: "0 auto", padding: "var(--sp-4)" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <ArticleCardSkeleton key={i} />
        ))}
      </div>
    </main>
  );
}
