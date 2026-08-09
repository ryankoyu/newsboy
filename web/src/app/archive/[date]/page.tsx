import { notFound } from "next/navigation";
import { dataProvider } from "@/lib/data";
import { HomeView } from "@/components/HomeView";
import { isEditionPast } from "@/lib/editionDate";

/**
 * Past-edition browse — enhancement-plan.md Batch 1 #4. Reuses HomeView's
 * card list layout with isPastEdition to swap the "today" greeting for a
 * plain date label (design intent: past editions should never look like
 * they're today's brief).
 */
export default async function ArchiveDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const edition = await dataProvider.getEditionByDate(date);
  if (!edition) notFound();

  return <HomeView edition={edition} isPastEdition={isEditionPast(edition.edition_date)} />;
}
