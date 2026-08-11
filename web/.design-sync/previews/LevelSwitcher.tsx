import { useState } from "react";
import { LevelSwitcher } from "@/components/LevelSwitcher";
import type { CefrLevel } from "@/lib/types";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "var(--sp-4)", background: "var(--color-bg)", maxWidth: 320 }}>{children}</div>
);

/** Interactive — starts on A2, the default level for a new reader. */
export const Interactive = () => {
  const [level, setLevel] = useState<CefrLevel>("A2");
  return (
    <Frame>
      <LevelSwitcher value={level} onChange={setLevel} />
    </Frame>
  );
};

/** Each level selected in turn, so the three active colours are comparable. */
export const EachLevelSelected = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
    {(["A2", "B1", "B2"] as CefrLevel[]).map((l) => (
      <Frame key={l}>
        <LevelSwitcher value={l} onChange={() => {}} />
      </Frame>
    ))}
  </div>
);
