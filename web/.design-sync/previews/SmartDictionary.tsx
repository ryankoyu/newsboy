import { SmartDictionary } from "@/components/SmartDictionary";
import { article, versionOf, wordsForVersion } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

const a2Words = wordsForVersion(versionOf(article, "A2").id);

/** The dictionary opened on a real seed word. anchorRect is null, which is
 *  the mobile path — the sheet docks to the bottom of the card. */
export const OnSeedWord = () => (
  <div style={{ position: "relative", minHeight: 420, background: "var(--color-bg)" }}>
    <SmartDictionary entry={a2Words[0]} anchorRect={null} onClose={() => {}} />
  </div>
);

/** A word the pipeline never glossed — the fallback entry shape, with the
 *  meaning and example fields empty. */
export const UnknownWord = () => (
  <div style={{ position: "relative", minHeight: 420, background: "var(--color-bg)" }}>
    <SmartDictionary
      entry={{ term: "settlers", pronunciation: null, meaning_ko: null, example: null }}
      anchorRect={null}
      onClose={() => {}}
    />
  </div>
);
