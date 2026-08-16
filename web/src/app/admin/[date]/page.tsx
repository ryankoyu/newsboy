import { notFound } from "next/navigation";
import { resolveEditionRepository } from "@/lib/admin/editionRepository";
import { loadSelectionReport, matchSelectionCandidate } from "@/lib/admin/selectionReport";
import type { CandidateReportEntry } from "@/lib/admin/pipelineTypes";
import { ReviewClient } from "./ReviewClient";

/**
 * Never prerendered.
 *
 * The desk reads live editions and the operator's own decisions, so a build-
 * time snapshot would be wrong the moment it was taken. Worse, with the desk's
 * credentials present in the build environment, Next's default static
 * generation opened a database connection *during the build* — which is how a
 * missing migration turned into a failed deploy rather than a screen that says
 * what is wrong.
 */
export const dynamic = "force-dynamic";

export default async function EditionReviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  const edition = await resolveEditionRepository().getEdition(date);
  if (!edition) notFound();

  const selectionReport = await loadSelectionReport(date);
  const selectionByArticleId: Record<string, CandidateReportEntry & { similarity: number }> = {};
  if (selectionReport) {
    for (const article of edition.articles) {
      const match = matchSelectionCandidate(article, selectionReport);
      if (match) {
        selectionByArticleId[article.id] = { ...match.candidate, similarity: match.similarity };
      }
    }
  }

  return (
    <ReviewClient
      edition={edition}
      selectionByArticleId={selectionByArticleId}
      hasSelectionReport={selectionReport !== null}
    />
  );
}
