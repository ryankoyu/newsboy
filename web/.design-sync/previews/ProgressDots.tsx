import { ProgressDots } from "@/components/onboarding/ProgressDots";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      padding: "var(--sp-5)",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--r-md)",
      maxWidth: 320,
    }}
  >
    {children}
  </div>
);

/** Each step of the 3-step onboarding, in order. */
export const EachStep = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
    <Frame>
      <ProgressDots step={1} />
    </Frame>
    <Frame>
      <ProgressDots step={2} />
    </Frame>
    <Frame>
      <ProgressDots step={3} />
    </Frame>
  </div>
);
