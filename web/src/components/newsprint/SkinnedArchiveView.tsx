"use client";

import type { ReactNode } from "react";
import type { Edition } from "@/lib/types";
import { NewsprintArchiveView } from "@/components/newsprint/NewsprintArchiveView";
import { useNewsprintSkin } from "@/components/newsprint/useNewsprintSkin";

/**
 * Chooses which skin renders the archive list.
 *
 * The standard version is the page's own server-rendered markup, passed in
 * as `fallback`, so the existing list keeps working untouched in dark mode.
 */
export function SkinnedArchiveView({
  editions,
  fallback,
}: {
  editions: Edition[];
  fallback: ReactNode;
}) {
  const newsprint = useNewsprintSkin();
  return newsprint ? <NewsprintArchiveView editions={editions} /> : <>{fallback}</>;
}
