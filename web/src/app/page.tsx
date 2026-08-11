import { dataProvider } from "@/lib/data";
import { SkinnedHomeView } from "@/components/newsprint/SkinnedHomeView";
import { isEditionPast } from "@/lib/editionDate";

export default async function Home() {
  const edition = await dataProvider.getLatestEdition();
  // docs/feature-status.md G4: home must not always claim the edition is
  // "today's" — check the actual edition date the same way ArticleViewer
  // does, so a stale/late edition shows the same "past brief" state on
  // both screens instead of contradicting each other.
  const isPastEdition = Boolean(edition && isEditionPast(edition.edition_date));
  return <SkinnedHomeView edition={edition} isPastEdition={isPastEdition} />;
}
