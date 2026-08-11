import { SentenceActionPopover } from "@/components/SentenceActionPopover";

/** Tapping a sentence that isn't saved yet — the "문장 저장" affordance. */
export const NotSaved = () => (
  <div style={{ position: "relative", minHeight: 320, background: "var(--color-bg)" }}>
    <SentenceActionPopover saved={false} anchorRect={null} onToggle={() => {}} onClose={() => {}} />
  </div>
);

/** The same popover on an already-saved sentence — the toggle flips to
 *  "저장 해제". */
export const Saved = () => (
  <div style={{ position: "relative", minHeight: 320, background: "var(--color-bg)" }}>
    <SentenceActionPopover saved anchorRect={null} onToggle={() => {}} onClose={() => {}} />
  </div>
);
