import { notFound } from "next/navigation";
import { dataProvider } from "@/lib/data";
import type { CefrLevel, Word } from "@/lib/types";
import { ArticleViewer } from "@/components/ArticleViewer";

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

  return (
    <ArticleViewer
      article={article}
      initialLevel={requestedLevel}
      hasExplicitLevel={hasExplicitLevel}
      wordsByVersion={wordsByVersion}
    />
  );
}
