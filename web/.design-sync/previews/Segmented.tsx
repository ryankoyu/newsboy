import { useState } from "react";
import { Segmented } from "@/components/Segmented";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: "var(--sp-4)", background: "var(--color-bg)", maxWidth: 320 }}>{children}</div>
);

/** The generic control with a plain two-option set. */
export const TwoOptions = () => {
  const [value, setValue] = useState<"all" | "unread">("all");
  return (
    <Frame>
      <Segmented
        ariaLabel="필터"
        value={value}
        onChange={setValue}
        options={[
          { value: "all", label: "전체" },
          { value: "unread", label: "안 읽음" },
        ]}
      />
    </Frame>
  );
};

/** Three options with per-option active colours — the level-switcher shape. */
export const WithActiveColors = () => {
  const [value, setValue] = useState<"A2" | "B1" | "B2">("B1");
  return (
    <Frame>
      <Segmented
        ariaLabel="레벨"
        value={value}
        onChange={setValue}
        options={[
          { value: "A2", label: "A2", activeColor: "var(--level-a2-fg)" },
          { value: "B1", label: "B1", activeColor: "var(--level-b1-fg)" },
          { value: "B2", label: "B2", activeColor: "var(--level-b2-fg)" },
        ]}
      />
    </Frame>
  );
};
