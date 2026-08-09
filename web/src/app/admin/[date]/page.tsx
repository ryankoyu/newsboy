import { notFound } from "next/navigation";
import { localFsEditionRepository } from "@/lib/admin/localFsEditionRepository";
import { loadSelectionReport, matchSelectionCandidate } from "@/lib/admin/selectionReport";
import type { CandidateReportEntry } from "@/lib/admin/pipelineTypes";
import { ReviewClient } from "./ReviewClient";

export default async function EditionReviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  const edition = await localFsEditionRepository.getEdition(date);
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
