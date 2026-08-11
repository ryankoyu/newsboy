import { ThemeToggle } from "@/components/ThemeToggle";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

const Bar = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "var(--sp-4)",
      padding: "var(--sp-3) var(--sp-4)",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--r-md)",
      fontFamily: "var(--font-ui)",
      fontSize: "var(--fs-ui)",
      color: "var(--color-text)",
      maxWidth: 360,
    }}
  >
    {children}
  </div>
);

/** In the settings row it actually lives in. */
export const InSettingsRow = () => (
  <Bar>
    <span>화면 테마</span>
    <ThemeToggle />
  </Bar>
);

/** On its own, as the header places it. */
export const Standalone = () => (
  <div style={{ padding: "var(--sp-4)", background: "var(--color-bg)" }}>
    <ThemeToggle />
  </div>
);
