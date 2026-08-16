import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dataProvider } from "@/lib/data";
import type { ArticleWithDetails, CefrLevel, Word } from "@/lib/types";
import { ArticleViewer } from "@/components/ArticleViewer";
import { collectBodyTerms } from "@/lib/glossTerms";

const VALID_LEVELS: CefrLevel[] = ["A2", "B1", "B2"];

function isValidLevel(level: string | undefined): level is CefrLevel {
  return VALID_LEVELS.includes(level as CefrLevel);
}

/**
 * generateMetadata and the page both need the article. `fetch` memoization
 * doesn't apply here (the provider is not fetch-based), so React `cache` is
 * what keeps it to one lookup per request — the documented substitute
 * (next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md).
 */
const getArticle = cache((slug: string) => dataProvider.getArticleBySlug(slug));

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ level?: string }>;
};

/** The version a request resolves to — same rule for the page and its metadata. */
function versionFor(article: ArticleWithDetails, levelParam: string | undefined) {
  const level = isValidLevel(levelParam) ? levelParam : article.versions[0]?.level ?? "A2";
  return article.versions.find((v) => v.level === level) ?? article.versions[0] ?? null;
}

/**
 * Per-article title and share card.
 *
 * Every article link used to inherit the root layout's metadata, so ten
 * different stories shared into KakaoTalk or a group chat all arrived as
 * "Newsboy" with the same generic blurb — indistinguishable, and sharing is
 * how a news service is passed around.
 *
 * Everything here comes from fields the article already has: the headline of
 * the version being served, and `event_summary`, which the pipeline writes
 * as the factual one-line account of the event. Nothing is composed for the
 * preview — a share card is a claim about the article, and an invented one
 * would be a claim the article never made. No description when the field is
 * empty; the root layout's stands in.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { level: levelParam } = await searchParams;
  const article = await getArticle(slug);
  // Unknown slug — the page below will 404; leave the root metadata alone.
  if (!article) return {};

  const version = versionFor(article, levelParam);
  const title = version ? `${version.title} · Newsboy` : "Newsboy";
  const description = article.event_summary ?? undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "Newsboy",
      locale: "ko_KR",
      publishedTime: article.published_at ?? undefined,
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { level: levelParam } = await searchParams;

  const article = await getArticle(slug);
  if (!article) notFound();

  const hasExplicitLevel = isValidLevel(levelParam);
  const requestedLevel = hasExplicitLevel
    ? levelParam
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

  // The dictionary behind every word that is not one of a level's curated
  // five (0006_glosses.sql). Fetched for all three levels at once: switching
  // level never leaves the server, so a per-level fetch would arrive after
  // the reader had already tapped something.
  const glosses = await dataProvider.getGlosses(
    collectBodyTerms(article.versions.map((v) => v.content)),
  );

  return (
    <ArticleViewer
      article={article}
      initialLevel={requestedLevel}
      hasExplicitLevel={hasExplicitLevel}
      wordsByVersion={wordsByVersion}
      glosses={glosses}
      edition={edition}
    />
  );
}
