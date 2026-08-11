"use client";

import type { ArticleWithDetails, CefrLevel, EditionWithArticles, Word } from "@/lib/types";
import { ArticleViewer } from "@/components/ArticleViewer";
import { NewsprintArticleViewer } from "@/components/newsprint/NewsprintArticleViewer";
import { useNewsprintSkin } from "@/components/newsprint/useNewsprintSkin";

/** Chooses which skin renders the reader (see useNewsprintSkin for the rule). */
export function SkinnedArticleViewer(props: {
  article: ArticleWithDetails;
  initialLevel: CefrLevel;
  hasExplicitLevel: boolean;
  wordsByVersion: Record<string, Word[]>;
  edition?: EditionWithArticles | null;
}) {
  const newsprint = useNewsprintSkin();
  return newsprint ? <NewsprintArticleViewer {...props} /> : <ArticleViewer {...props} />;
}
