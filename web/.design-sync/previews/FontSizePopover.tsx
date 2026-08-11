import { FontSizePopover } from "@/components/FontSizePopover";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

/** The reading-size control as it sits in the article viewer's toolbar. */
export const InToolbar = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "var(--sp-3)",
      padding: "var(--sp-3) var(--sp-4)",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--r-md)",
      maxWidth: 320,
    }}
  >
    <span
      style={{
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-sm)",
        color: "var(--color-text-secondary)",
      }}
    >
      본문 크기
    </span>
    <FontSizePopover />
  </div>
);
