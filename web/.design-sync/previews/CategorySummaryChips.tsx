import { CategorySummaryChips } from "@/components/CategorySummaryChips";
import { articles } from "../fixtures/seed";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 560, padding: "var(--sp-4)", background: "var(--color-bg)" }}>{children}</div>
);

/** The full seed edition — the chip row that summarises today's categories. */
export const FullEdition = () => (
  <Frame>
    <CategorySummaryChips articles={articles} />
  </Frame>
);

/** A three-article day — the row has to look deliberate when short too. */
export const ShortEdition = () => (
  <Frame>
    <CategorySummaryChips articles={articles.slice(0, 3)} />
  </Frame>
);
