import { notFound } from "next/navigation";
import { dataProvider } from "@/lib/data";
import type { CefrLevel, Word } from "@/lib/types";
import { SkinnedArticleViewer } from "@/components/newsprint/SkinnedArticleViewer";

const VALID_LEVELS: CefrLevel[] = ["A2", "B1", "B2"];

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { slug } = await params;
  const { level: levelParam } = await searchParams;

  const article = await dataProvider.getArticleBySlug(slug);
  if (!article) notFound();

  const hasExplicitLevel = VALID_LEVELS.includes(levelParam as CefrLevel);
  const requestedLevel = hasExplicitLevel
    ? (levelParam as CefrLevel)
    : article.versions[0]?.level ?? "A2";

  const wordsByVersion: Record<string, Word[]> = {};
  for (const v of article.versions) {
    wordsByVersion[v.id] = await dataProvider.getWordsForVersion(v.id);
  }

  // Resolve the edition this article belongs to (for continuous-reading
  // progress/next-article — enhancement-plan.md Batch 1 #2/#3). Works for
  // both the current and past (archive) editions — degrades to null
  // (features simply don't render) if no edition_id or lookup fails.
  let edition = null;
  if (article.edition_id) {
    const allEditions = await dataProvider.listEditions();
    const match = allEditions.find((e) => e.id === article.edition_id);
    edition = match ? await dataProvider.getEditionByDate(match.edition_date) : null;
  }

  return (
    <SkinnedArticleViewer
      article={article}
      initialLevel={requestedLevel}
      hasExplicitLevel={hasExplicitLevel}
      wordsByVersion={wordsByVersion}
      edition={edition}
    />
  );
}
