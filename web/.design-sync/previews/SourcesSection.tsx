import { SourcesSection } from "@/components/SourcesSection";
import { article, secondArticle } from "../fixtures/seed";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 560, padding: "var(--sp-4)", background: "var(--color-bg)" }}>{children}</div>
);

/** The rank-1 article's real sources, grouped by outlet. */
export const SeedArticleSources = () => (
  <Frame>
    <SourcesSection sources={article.sources} />
  </Frame>
);

/** A second article — a different outlet mix, to check the grouping holds. */
export const OtherArticleSources = () => (
  <Frame>
    <SourcesSection sources={secondArticle.sources} />
  </Frame>
);
