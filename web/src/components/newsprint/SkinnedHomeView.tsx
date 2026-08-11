"use client";

import type { EditionWithArticles } from "@/lib/types";
import { HomeView } from "@/components/HomeView";
import { NewsprintFrontPage } from "@/components/newsprint/NewsprintFrontPage";
import { NewsprintBroadsheet } from "@/components/newsprint/NewsprintBroadsheet";
import { useNewsprintSkin } from "@/components/newsprint/useNewsprintSkin";
import { useDesktop } from "@/components/newsprint/useDesktop";

/**
 * Chooses which skin — and at desktop, which newsprint layout — renders home.
 * The 430px column carries below 1024px; the broadsheet takes over above it
 * (handoff, "Responsive").
 */
export function SkinnedHomeView(props: {
  edition: EditionWithArticles | null;
  isPastEdition?: boolean;
}) {
  const newsprint = useNewsprintSkin();
  const desktop = useDesktop();
  if (!newsprint) return <HomeView {...props} />;
  return desktop ? <NewsprintBroadsheet {...props} /> : <NewsprintFrontPage {...props} />;
}
