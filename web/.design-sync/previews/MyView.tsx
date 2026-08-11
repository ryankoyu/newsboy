import { MyView } from "@/components/MyView";
import { edition } from "../fixtures/seed";
import { seedSession } from "../fixtures/session";

// MyView reads everything it shows from the local session, so an unseeded
// account renders the same empty page for every prop combination. Seeding the
// store through the app's own API is what makes the populated state visible.
seedSession();

/** My Library for a reader who has read two articles, bookmarked two, and
 *  saved words and a sentence — the state the screen is designed around. */
export const Populated = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 560 }}>
    <MyView edition={edition} />
  </div>
);

/** No edition published yet — the weekly-brief block has nothing to compute
 *  from, so the screen falls back to its saved-items-only layout. */
export const NoEdition = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 420 }}>
    <MyView edition={null} />
  </div>
);
