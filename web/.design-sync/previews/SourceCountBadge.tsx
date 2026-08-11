import { SourceCountBadge } from "@/components/SourceCountBadge";
import { articles } from "../fixtures/seed";
import { countUniqueOutlets } from "@/lib/sourceOutlets";

/** Real outlet counts from the seed edition's first four articles. */
export const FromSeedArticles = () => (
  <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", padding: "var(--sp-3)" }}>
    {articles.slice(0, 4).map((a) => (
      <SourceCountBadge key={a.id} count={countUniqueOutlets(a.sources)} />
    ))}
  </div>
);

/** Zero renders nothing — the badge only appears when trust can be shown. */
export const RangeIncludingZero = () => (
  <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", padding: "var(--sp-3)" }}>
    <SourceCountBadge count={0} />
    <SourceCountBadge count={2} />
    <SourceCountBadge count={7} />
  </div>
);
