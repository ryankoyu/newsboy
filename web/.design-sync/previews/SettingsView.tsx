import { SettingsView } from "@/components/SettingsView";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

/** The full settings screen — level, theme, reading size and the about links. */
export const Default = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 560 }}>
    <SettingsView />
  </div>
);
