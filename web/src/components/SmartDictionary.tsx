"use client";

import { useEffect, useRef } from "react";
import type { Word } from "@/lib/types";
import { useSession } from "@/lib/useSession";

/**
 * Smart Dictionary popup — a3-ui-ux.md §2-3.
 * Mobile: bottom sheet. Desktop (>=1024px): popover anchored near the word.
 * MVP fields only: term, IPA (mono), meaning (ko), in-context example.
 * No TTS button (design-decisions.md §4.4 — IPA only, playback is V1.5).
 *
 * `anchorRect` positions the desktop popover; on mobile it's ignored and the
 * sheet always docks to the bottom.
 */
export interface DictionaryEntry {
  term: string;
  pronunciation: string | null;
  meaning_ko: string;
  example: string | null;
}

export function SmartDictionary({
  entry,
  anchorRect,
  onClose,
  returnFocusRef,
}: {
  entry: DictionaryEntry | Word;
  anchorRect: DOMRect | null;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const { session, refresh } = useSession();
  const dialogRef = useRef<HTMLDivElement>(null);
  const saved = session.isWordSaved(entry.term);

  useEffect(() => {
    session.markWordSeen(entry.term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.term]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        returnFocusRef?.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    // Focus the dialog on open for screen readers / keyboard users.
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, returnFocusRef]);

  function handleToggleSave() {
    session.toggleSavedWord({ term: entry.term, meaning_ko: entry.meaning_ko });
    refresh();
  }

  function handleScrimClick() {
    onClose();
    returnFocusRef?.current?.focus();
  }

  const isDesktop =
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

  const content = (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.term} 사전`}
      tabIndex={-1}
      className="briefly-sheet"
      style={{
        background: "var(--color-surface)",
        borderRadius: isDesktop ? "var(--r-md)" : "var(--r-lg) var(--r-lg) 0 0",
        boxShadow: "var(--shadow-pop)",
        padding: "var(--sp-5)",
        maxWidth: isDesktop ? 320 : undefined,
        width: isDesktop ? 320 : "100%",
        animation: isDesktop ? undefined : "briefly-sheet-up var(--dur-base) var(--ease)",
      }}
    >
      {!isDesktop && (
        <div
          aria-hidden
          style={{
            width: 36,
            height: 4,
            borderRadius: "var(--r-pill)",
            background: "var(--color-border-strong)",
            margin: "0 auto var(--sp-4)",
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--sp-2)",
        }}
      >
        <span
          lang="en"
          style={{
            fontFamily: "var(--font-en)",
            fontSize: "var(--fs-h2)",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          {entry.term}
        </span>
        <button
          type="button"
          onClick={handleToggleSave}
          aria-pressed={saved}
          aria-label={saved ? "단어장에서 제거" : "단어장에 저장"}
          style={{
            background: "transparent",
            border: "none",
            fontSize: 20,
            color: saved ? "var(--color-accent)" : "var(--color-text-muted)",
            padding: "var(--sp-1)",
          }}
        >
          <span aria-hidden>🔖</span>
        </button>
      </div>

      {entry.pronunciation && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-sm)",
            color: "var(--color-text-secondary)",
            margin: "var(--sp-1) 0 0",
          }}
        >
          {entry.pronunciation}
        </p>
      )}

      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--color-border)",
          margin: "var(--sp-4) 0",
        }}
      />

      <p
        lang="ko"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          color: "var(--color-text)",
          margin: 0,
        }}
      >
        {entry.meaning_ko}
      </p>

      {entry.example && (
        <div style={{ marginTop: "var(--sp-4)" }}>
          <p
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-sm)",
              color: "var(--color-text-muted)",
              margin: "0 0 var(--sp-1)",
            }}
          >
            In this story:
          </p>
          <p
            lang="en"
            style={{
              fontFamily: "var(--font-en)",
              fontSize: "var(--fs-ui)",
              lineHeight: "var(--lh-ui)",
              color: "var(--color-text)",
              margin: 0,
              fontStyle: "italic",
            }}
          >
            &ldquo;{entry.example}&rdquo;
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleToggleSave}
        style={{
          marginTop: "var(--sp-5)",
          width: "100%",
          height: 48,
          borderRadius: "var(--r-sm)",
          border: "none",
          background: "var(--color-accent)",
          color: "var(--color-text-invert)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          fontWeight: 600,
        }}
      >
        {saved ? "✓ 내 단어장에 저장됨" : "＋ 내 단어장에 저장"}
      </button>
    </div>
  );

  if (isDesktop && anchorRect) {
    const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 400);
    const left = Math.min(anchorRect.left, window.innerWidth - 336);
    return (
      <>
        <div
          onClick={handleScrimClick}
          style={{ position: "fixed", inset: 0, zIndex: 40 }}
        />
        <div
          style={{
            position: "fixed",
            top: Math.max(8, top),
            left: Math.max(8, left),
            zIndex: 41,
          }}
        >
          {content}
        </div>
      </>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        className="briefly-dim"
        onClick={handleScrimClick}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,.32)",
          animation: "briefly-dim-in var(--dur-base) var(--ease)",
        }}
      />
      <div style={{ position: "relative", width: "100%" }}>{content}</div>
    </div>
  );
}
