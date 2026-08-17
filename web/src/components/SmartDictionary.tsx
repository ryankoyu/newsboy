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
 *
 * design-decisions.md §4.8-1 ("모든 단어 클릭 가능"): a word with no meaning
 * still opens this same component, with meaning_ko: null. We never invent one.
 *
 * What an empty card means changed on 2026-08-16. It used to mean "not one of
 * this level's five curated words", which was most of the page, and the card
 * said 뜻 준비 중 and promised to tell the reader when the dictionary caught
 * up — a promise nothing in the codebase could keep: no backfill existed and
 * no notification did either. Now every word in a body is glossed at
 * publication time (pipeline/src/pipeline/glossary.ts), so an empty card means
 * something narrower and true: this word has no meaning to give.
 *
 * Two kinds of word land here, and the card names both. Proper nouns, which
 * the pipeline deliberately refuses to gloss because describing a company or
 * a person is asserting a fact about the world. And the handful the model
 * declines because Korean has nothing to put there — "a" and "the" have no
 * article system to translate into.
 *
 * The card said only the first for two days, until a reader tapped "with" and
 * was told it was a name. That word is glossed now (the stoplist that skipped
 * it is gone), but the lesson stands: an explanation that covers one case
 * reads as a lie in the other.
 *
 * Save still works on an empty card — a reader who wants to keep the word
 * keeps it, marked 뜻 미등록 (session.ts SavedWordEntry.meaning_ko: null).
 */
export interface DictionaryEntry {
  term: string;
  pronunciation: string | null;
  meaning_ko: string | null;
  example: string | null;
  /**
   * docs/feature-status.md G9 — part of speech ("n.", "v.", "adj." ...).
   * Always undefined on the empty card (a word with no meaning has no pos
   * never have a pos), kept here only so the shared `Word | DictionaryEntry`
   * union type-checks. Shown when present, omitted when absent — never
   * invented.
   */
  pos?: string | null;
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

  const hasMeaning = Boolean(entry.meaning_ko);

  function handleToggleSave() {
    session.toggleSavedWord({ term: entry.term, meaning_ko: entry.meaning_ko ?? null });
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

      {hasMeaning ? (
        <p
          lang="ko"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-ui)",
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          {entry.pos && (
            <span
              lang="en"
              style={{
                display: "inline-block",
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-xs)",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                background: "var(--color-surface-alt)",
                borderRadius: "var(--r-sm)",
                padding: "1px var(--sp-1)",
                marginRight: "var(--sp-2)",
                verticalAlign: "middle",
              }}
            >
              {entry.pos}
            </span>
          )}
          {entry.meaning_ko}
        </p>
      ) : (
        <p
          lang="ko"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-ui)",
            color: "var(--color-text-muted)",
            fontStyle: "italic",
            margin: 0,
          }}
        >
          이 단어에는 뜻을 붙이지 않았어요. 사람·회사 이름처럼 지어낼 수 없는 말, 또는 a·the처럼 한국어로 옮길 말이 마땅치 않은 경우입니다.
        </p>
      )}

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
        {saved ? "저장됨 ✓" : "단어장에 저장"}
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
