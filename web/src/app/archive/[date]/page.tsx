import { notFound } from "next/navigation";
import { dataProvider } from "@/lib/data";
import { SkinnedHomeView } from "@/components/newsprint/SkinnedHomeView";
import { isEditionPast } from "@/lib/editionDate";

/**
 * Past-edition browse — enhancement-plan.md Batch 1 #4. Reuses the home view's
 * card list layout with isPastEdition to swap the "today" greeting for a
 * plain date label (design intent: past editions should never look like
 * they're today's brief).
 *
 * Goes through SkinnedHomeView rather than HomeView directly: AppShell treats
 * /archive as a newsprint route and hides the global header and tab bar,
 * because the newsprint pages draw their own. Rendering the unskinned
 * HomeView here left the page with no chrome from either side — no tab bar,
 * no header, no way back out of a past edition short of the browser's back
 * button. The skinned view brings the newsprint nameplate and tab bar with
 * it, and still falls back to HomeView (inside the standard shell) in dark
 * mode, where the skin is off.
 */
export default async function ArchiveDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const edition = await dataProvider.getEditionByDate(date);
  if (!edition) notFound();

  return (
    <SkinnedHomeView edition={edition} isPastEdition={isEditionPast(edition.edition_date)} />
  );
}
