import { LevelBadge } from "@/components/LevelBadge";

/** The three CEFR levels — green / blue / purple, text always present. */
export const AllLevels = () => (
  <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", padding: "var(--sp-3)" }}>
    <LevelBadge level="A2" />
    <LevelBadge level="B1" />
    <LevelBadge level="B2" />
  </div>
);
