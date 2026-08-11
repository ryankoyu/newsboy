import { ArticleBody } from "@/components/ArticleBody";
import { article, versionOf, wordsForVersion } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

const Page = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      maxWidth: "var(--content-max)",
      background: "var(--color-bg)",
      padding: "var(--sp-5)",
    }}
  >
    {children}
  </div>
);

const a2 = versionOf(article, "A2");
const b2 = versionOf(article, "B2");

/** A2 body — short sentences, key words carrying an inline Korean gloss. */
export const LevelA2 = () => (
  <Page>
    <ArticleBody
      articleId={article.id}
      level="A2"
      sentences={a2.sentences}
      words={wordsForVersion(a2.id)}
    />
  </Page>
);

/** B2 body — the same event at the hardest level, so the serif reading
 *  measure and line height can be compared against A2 above. */
export const LevelB2 = () => (
  <Page>
    <ArticleBody
      articleId={article.id}
      level="B2"
      sentences={b2.sentences}
      words={wordsForVersion(b2.id)}
    />
  </Page>
);
