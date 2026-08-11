import { CategoryTag } from "@/components/CategoryTag";
import { categories } from "../fixtures/seed";

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", padding: "var(--sp-3)" }}>
    {children}
  </div>
);

/** Every category in the seed set — the full colour vocabulary at a glance. */
export const AllCategories = () => (
  <Wrap>
    {categories.map((c) => (
      <CategoryTag key={c.id} category={c} />
    ))}
  </Wrap>
);

/** md (default) vs sm — sm is what the article card uses in its meta row. */
export const Sizes = () => (
  <Wrap>
    <CategoryTag category={categories[0]} size="md" />
    <CategoryTag category={categories[0]} size="sm" />
  </Wrap>
);
