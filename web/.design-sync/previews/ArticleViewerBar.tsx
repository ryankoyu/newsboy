import { ArticleViewerBar } from "@/components/ArticleViewerBar";
import { article } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

/** The sticky bar at the top of an article — back arrow plus save/read state.
 *  Bound to the real seed article id so its session lookups resolve. */
export const Default = () => (
  <div style={{ maxWidth: 560, background: "var(--color-bg)" }}>
    <ArticleViewerBar articleId={article.id} />
  </div>
);
