import { connection } from "next/server";
import { dataProvider } from "@/lib/data";
import { SkinnedHomeView } from "@/components/newsprint/SkinnedHomeView";
import { isEditionPast } from "@/lib/editionDate";

export default async function Home() {
  // `isEditionPast` reads the clock, and nothing else on this route is
  // request-dependent — so `next build` prerendered home as static (`○ /` in
  // the build output) and baked in whatever "today" meant at deploy time.
  // The greeting would then keep saying "오늘" (or "지난 브리핑") for as long
  // as the deploy lived. connection() is the documented way to say "this
  // output differs per request because it reads `new Date()`"
  // (next/dist/docs/01-app/03-api-reference/04-functions/connection.md).
  await connection();

  const edition = await dataProvider.getLatestEdition();
  // docs/feature-status.md G4: home must not always claim the edition is
  // "today's" — check the actual edition date the same way ArticleViewer
  // does, so a stale/late edition shows the same "past brief" state on
  // both screens instead of contradicting each other.
  const isPastEdition = Boolean(edition && isEditionPast(edition.edition_date));
  return <SkinnedHomeView edition={edition} isPastEdition={isPastEdition} />;
}
