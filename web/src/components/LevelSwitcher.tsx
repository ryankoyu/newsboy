"use client";

import type { CefrLevel } from "@/lib/types";
import { Segmented } from "@/components/Segmented";

const LEVEL_OPTIONS: { value: CefrLevel; label: string; colorVar: string }[] = [
  { value: "A2", label: "A2", colorVar: "--level-a2-fg" },
  { value: "B1", label: "B1", colorVar: "--level-b1-fg" },
  { value: "B2", label: "B2", colorVar: "--level-b2-fg" },
];

/**
 * Level switcher — a3-ui-ux.md §2-2 point 3. Sticky segment control,
 * A2/B1/B2 only (Original excluded per design-decisions.md §4 item 7).
 */
export function LevelSwitcher({
  value,
  onChange,
}: {
  value: CefrLevel;
  onChange: (level: CefrLevel) => void;
}) {
  return (
    <Segmented
      ariaLabel="레벨 선택"
      value={value}
      onChange={onChange}
      options={LEVEL_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
        activeColor: `var(${o.colorVar})`,
      }))}
    />
  );
}
