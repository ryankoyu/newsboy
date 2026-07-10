import type { Category } from "@/lib/types";

const CAT_VAR: Record<string, string> = {
  world: "--cat-world",
  korea: "--cat-korea",
  ai: "--cat-ai",
  tech: "--cat-tech",
  business: "--cat-business",
  finance: "--cat-finance",
  science: "--cat-science",
  sports: "--cat-sports",
  culture: "--cat-culture",
  lifestyle: "--cat-lifestyle",
};

/**
 * Category tag — dot + emoji + label. a3-ui-ux.md §1-4.
 * Never color-only: always paired with emoji + text label.
 */
export function CategoryTag({
  category,
  size = "md",
}: {
  category: Category | null;
  size?: "sm" | "md";
}) {
  if (!category) return null;
  const colorVar = CAT_VAR[category.slug] ?? "--color-text-muted";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--sp-2)",
        fontFamily: "var(--font-ui)",
        fontSize: size === "sm" ? "var(--fs-sm)" : "var(--fs-ui)",
        color: "var(--color-text-secondary)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: `var(${colorVar})`,
          flexShrink: 0,
        }}
      />
      <span aria-hidden>{category.emoji}</span>
      <span>{category.label}</span>
    </span>
  );
}
