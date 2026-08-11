import { WordListSection } from "@/components/WordListSection";
import { article, versionOf, wordsForVersion } from "../fixtures/seed";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 560, padding: "var(--sp-4)", background: "var(--color-bg)" }}>{children}</div>
);

const a2Words = wordsForVersion(versionOf(article, "A2").id);
const b2Words = wordsForVersion(versionOf(article, "B2").id);

/** The A2 word list for the seed article — term, pronunciation, Korean meaning. */
export const A2Words = () => (
  <Frame>
    <WordListSection words={a2Words} />
  </Frame>
);

/** The B2 list — harder vocabulary, longer glosses. */
export const B2Words = () => (
  <Frame>
    <WordListSection words={b2Words} />
  </Frame>
);
