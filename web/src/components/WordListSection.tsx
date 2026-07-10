"use client";

import { useRef, useState } from "react";
import type { Word } from "@/lib/types";
import { SmartDictionary } from "@/components/SmartDictionary";

/**
 * "Words in this story" — collapsible section (default expanded).
 * a3-ui-ux.md §2-2 point 5. Tapping an item opens the same Smart Dictionary.
 */
export function WordListSection({ words }: { words: Word[] }) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<{ word: Word; ref: React.RefObject<HTMLElement | null> } | null>(
    null
  );

  if (words.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--color-surface-alt)",
        borderRadius: "var(--r-md)",
        padding: "var(--sp-4)",
        marginTop: "var(--sp-8)",
      }}
      aria-label="Words in this story"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h3)",
          fontWeight: 600,
          color: "var(--color-text)",
          padding: 0,
        }}
      >
        <span>📖 Words in this story</span>
        <span aria-hidden style={{ transform: open ? "rotate(180deg)" : "none" }}>
          ▾
        </span>
      </button>

      {open && (
        <ul style={{ listStyle: "none", margin: "var(--sp-3) 0 0", padding: 0 }}>
          {words.map((w) => (
            <WordListItem key={w.id} word={w} onOpen={(ref) => setActive({ word: w, ref })} />
          ))}
        </ul>
      )}

      {active && (
        <SmartDictionary
          entry={active.word}
          anchorRect={active.ref.current?.getBoundingClientRect() ?? null}
          onClose={() => setActive(null)}
          returnFocusRef={active.ref}
        />
      )}
    </section>
  );
}

function WordListItem({
  word,
  onOpen,
}: {
  word: Word;
  onOpen: (ref: React.RefObject<HTMLElement | null>) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => onOpen(ref)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "baseline",
          gap: "var(--sp-3)",
          padding: "var(--sp-2) 0",
          background: "transparent",
          border: "none",
          textAlign: "left",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <span
          lang="en"
          style={{
            fontFamily: "var(--font-en)",
            fontSize: "var(--fs-ui)",
            fontWeight: 600,
            color: "var(--color-text)",
            minWidth: 90,
          }}
        >
          {word.term}
        </span>
        <span
          lang="ko"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-ui)",
            color: "var(--color-text-secondary)",
          }}
        >
          {word.meaning_ko}
        </span>
      </button>
    </li>
  );
}
