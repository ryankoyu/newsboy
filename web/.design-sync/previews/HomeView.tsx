import { HomeView } from "@/components/HomeView";
import { edition } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

/** The home screen with the real seed edition — greeting, category chips,
 *  and the Top-10 article list. */
export const TodaysEdition = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 640 }}>
    <HomeView edition={edition} />
  </div>
);

/** A past edition — the archive variant, which adds the "지난 브리핑" framing. */
export const PastEdition = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 640 }}>
    <HomeView edition={edition} isPastEdition />
  </div>
);

/** No edition published yet — the empty state the home screen falls back to. */
export const NoEdition = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 320 }}>
    <HomeView edition={null} />
  </div>
);
