import { GreetingBlock } from "@/components/GreetingBlock";
import { articles, versionOf } from "../fixtures/seed";
import { estimateReadingMinutes } from "@/lib/data";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

const totalMinutes = articles.reduce((sum, a) => {
  const v = versionOf(a, "A2");
  return sum + estimateReadingMinutes("A2", v?.word_count ?? null);
}, 0);

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 480, padding: "var(--sp-5)", background: "var(--color-bg)" }}>{children}</div>
);

/** The real seed edition's numbers — 10 articles and their A2 reading time. */
export const SeedEdition = () => (
  <Frame>
    <GreetingBlock totalArticles={articles.length} totalMinutes={totalMinutes} />
  </Frame>
);

/** A lighter day — the copy has to hold at small counts too. */
export const ShortEdition = () => (
  <Frame>
    <GreetingBlock totalArticles={3} totalMinutes={6} />
  </Frame>
);
