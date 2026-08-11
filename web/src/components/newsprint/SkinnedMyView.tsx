"use client";

import type { EditionWithArticles } from "@/lib/types";
import { MyView } from "@/components/MyView";
import { NewsprintMyView } from "@/components/newsprint/NewsprintMyView";
import { useNewsprintSkin } from "@/components/newsprint/useNewsprintSkin";

/** Chooses which skin renders My Index (see useNewsprintSkin). */
export function SkinnedMyView({ edition }: { edition: EditionWithArticles | null }) {
  const newsprint = useNewsprintSkin();
  return newsprint ? <NewsprintMyView edition={edition} /> : <MyView edition={edition} />;
}
