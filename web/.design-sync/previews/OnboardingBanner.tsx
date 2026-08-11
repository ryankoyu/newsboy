import { OnboardingBanner } from "@/components/OnboardingBanner";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

/** The dismissible banner that sits above the home feed for new readers. */
export const Default = () => (
  <div style={{ maxWidth: 520, padding: "var(--sp-4)", background: "var(--color-bg)" }}>
    <OnboardingBanner />
  </div>
);

/** In place — above a page heading, at the width the home screen uses. */
export const AboveFeed = () => (
  <div
    style={{
      maxWidth: 520,
      padding: "var(--sp-4)",
      background: "var(--color-bg)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--sp-4)",
    }}
  >
    <OnboardingBanner />
    <h2
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-h2)",
        margin: 0,
        color: "var(--color-text)",
      }}
    >
      오늘의 브리핑
    </h2>
  </div>
);
