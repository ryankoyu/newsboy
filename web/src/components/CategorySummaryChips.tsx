import type { ArticleWithDetails } from "@/lib/types";

/**
 * Horizontal-scroll category summary chips — a3-ui-ux.md §2-1.
 * "🌍 3 · 🇰🇷 2 · 🤖 2 ..." preview of today's category mix.
 */
export function CategorySummaryChips({
  articles,
}: {
  articles: ArticleWithDetails[];
}) {
  const counts = new Map<string, { emoji: string; label: string; count: number }>();
  for (const a of articles) {
    if (!a.category) continue;
    const key = a.category.slug;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        emoji: a.category.emoji ?? "",
        label: a.category.label,
        count: 1,
      });
    }
  }

  if (counts.size === 0) return null;

  return (
    <div
      className="briefly-hscroll"
      style={{ gap: "var(--sp-4)", marginBottom: "var(--sp-6)" }}
      aria-label="오늘의 카테고리 구성"
    >
      {[...counts.values()].map((c) => (
        <span
          key={c.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--sp-1)",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-ui)",
            color: "var(--color-text-secondary)",
          }}
        >
          <span aria-hidden>{c.emoji}</span>
          <span>{c.count}</span>
        </span>
      ))}
    </div>
  );
}
