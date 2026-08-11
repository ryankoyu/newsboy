import { BriefCompleteCard } from "@/components/BriefCompleteCard";
import { articles } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 480, padding: "var(--sp-4)", background: "var(--color-bg)" }}>{children}</div>
);

/** The reward card at the end of a full seed edition. */
export const FullEdition = () => (
  <Frame>
    <BriefCompleteCard totalToday={articles.length} />
  </Frame>
);

/** A shorter day. */
export const ShortEdition = () => (
  <Frame>
    <BriefCompleteCard totalToday={3} />
  </Frame>
);
