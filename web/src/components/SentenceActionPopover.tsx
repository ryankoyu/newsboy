"use client";

import { useEffect, useRef } from "react";

/**
 * Sentence action popover — design-decisions.md §4.7 / task spec item 2.
 * Triggered by tapping a sentence's non-word area (word-span clicks take
 * priority and never reach this handler — see ArticleBody.tsx). Offers a
 * single toggle: "문장 저장" / "저장 해제".
 *
 * Mirrors SmartDictionary's popover/bottom-sheet split (a3-ui-ux.md §2-3):
 * mobile -> bottom sheet, desktop (>=1024px) -> anchored popover. Small and
 * single-purpose, unlike the dictionary sheet.
 */
export function SentenceActionPopover({
  saved,
  anchorRect,
  onToggle,
  onClose,
  returnFocusRef,
}: {
  saved: boolean;
  anchorRect: DOMRect | null;
  onToggle: () => void;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        returnFocusRef?.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, returnFocusRef]);

  function handleScrimClick() {
    onClose();
    returnFocusRef?.current?.focus();
  }

  function handleToggleClick() {
    onToggle();
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
      aria-label="문장 저장 액션"
      tabIndex={-1}
      className="briefly-sheet"
      style={{
        background: "var(--color-surface)",
        borderRadius: isDesktop ? "var(--r-md)" : "var(--r-lg) var(--r-lg) 0 0",
        boxShadow: "var(--shadow-pop)",
        padding: "var(--sp-4)",
        maxWidth: isDesktop ? 260 : undefined,
        width: isDesktop ? 260 : "100%",
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
            margin: "0 auto var(--sp-3)",
          }}
        />
      )}
      <button
        type="button"
        onClick={handleToggleClick}
        aria-pressed={saved}
        style={{
          width: "100%",
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--sp-2)",
          borderRadius: "var(--r-sm)",
          border: "none",
          background: saved ? "var(--color-surface-alt)" : "var(--color-accent)",
          color: saved ? "var(--color-text)" : "var(--color-text-invert)",
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          fontWeight: 600,
        }}
      >
        <span aria-hidden>{saved ? "✓" : "🖊️"}</span>
        <span>{saved ? "저장 해제" : "문장 저장"}</span>
      </button>
    </div>
  );

  if (isDesktop && anchorRect) {
    const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 120);
    const left = Math.min(anchorRect.left, window.innerWidth - 276);
    return (
      <>
        <div onClick={handleScrimClick} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
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
