import { ArticleCard } from "@/components/ArticleCard";
import { article, secondArticle } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

const Column = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "var(--sp-3)",
      maxWidth: 420,
      background: "var(--color-bg)",
      padding: "var(--sp-4)",
    }}
  >
    {children}
  </div>
);

/** A single card as it appears in the home list — the canonical use. */
export const Default = () => (
  <Column>
    <ArticleCard article={article} />
  </Column>
);

/** Two stacked cards — the actual home-feed rhythm, and how the category
 *  tag / level badge / read-time row reads across different headlines. */
export const InList = () => (
  <Column>
    <ArticleCard article={article} />
    <ArticleCard article={secondArticle} />
  </Column>
);
