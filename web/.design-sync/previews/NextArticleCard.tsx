import { NextArticleCard } from "@/components/NextArticleCard";
import { secondArticle, articles } from "../fixtures/seed";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 480, padding: "var(--sp-4)", background: "var(--color-bg)" }}>{children}</div>
);

/** What you see at the end of an article — the next one queued up, at A2. */
export const AtA2 = () => (
  <Frame>
    <NextArticleCard article={secondArticle} level="A2" />
  </Frame>
);

/** The same slot at B2 — longer headline, harder level badge. */
export const AtB2 = () => (
  <Frame>
    <NextArticleCard article={articles[2] ?? secondArticle} level="B2" />
  </Frame>
);
