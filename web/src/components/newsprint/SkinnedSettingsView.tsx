"use client";

import { SettingsView } from "@/components/SettingsView";
import { NewsprintSettingsView } from "@/components/newsprint/NewsprintSettingsView";
import { useNewsprintSkin } from "@/components/newsprint/useNewsprintSkin";

/** Chooses which skin renders settings (see useNewsprintSkin). */
export function SkinnedSettingsView() {
  const newsprint = useNewsprintSkin();
  return newsprint ? <NewsprintSettingsView /> : <SettingsView />;
}
