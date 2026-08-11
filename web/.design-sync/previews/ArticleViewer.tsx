import { ArticleViewer } from "@/components/ArticleViewer";
import { article, edition, wordsForVersion } from "../fixtures/seed";
import type { Word } from "@/lib/types";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

const wordsByVersion: Record<string, Word[]> = Object.fromEntries(
  article.versions.map((v) => [v.id, wordsForVersion(v.id)])
);

/** The reading screen at A2 — level switcher, body with clickable words,
 *  sources and word list, all from the real seed article. */
export const AtA2 = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 720 }}>
    <ArticleViewer
      article={article}
      initialLevel="A2"
      hasExplicitLevel
      wordsByVersion={wordsByVersion}
      edition={edition}
    />
  </div>
);

/** The same article opened at B2 — the hardest rewrite of the same event. */
export const AtB2 = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 720 }}>
    <ArticleViewer
      article={article}
      initialLevel="B2"
      hasExplicitLevel
      wordsByVersion={wordsByVersion}
      edition={edition}
    />
  </div>
);
