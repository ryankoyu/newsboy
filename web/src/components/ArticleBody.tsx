"use client";

import { useRef, useState } from "react";
import type { CefrLevel, Gloss, Word } from "@/lib/types";
import { SmartDictionary, type DictionaryEntry } from "@/components/SmartDictionary";
import { SentenceActionPopover } from "@/components/SentenceActionPopover";
import { useSession } from "@/lib/useSession";
import {
  tokenizeSentence,
  buildWordSequences,
  findMatchedRuns,
  lookupKey,
} from "@/lib/wordMatcher";

/**
 * Article body — renders sentence-level content (A2 §3-2 data model note:
 * content is split into sentences at read time) with every word clickable.
 *
 * a3-ui-ux.md §2-2 point 4, §3-2 word click rules:
 * - punctuation/whitespace not clickable
 * - hyphenated words are one token
 * - lookup key = lowercase, punctuation-stripped lemma
 * - role="button" tabindex="0", Enter/Space triggers
 * - SAVED words get a filled highlight (design-decisions.md §4.7 item 3).
 *   They are the only marked words: the dotted underline that used to mark
 *   every word the reader had tapped was removed on 2026-08-19 — see
 *   globals.css for why.
 *
 * Matching curated words (Word[]) against body tokens (Q2 fix):
 * - Multi-word terms ("lay off") match a contiguous token sequence, and the
 *   ENTIRE sequence becomes one clickable span (not just the first word).
 * - Curly apostrophes (') are normalized to straight ('), and vice versa,
 *   so "Zuckerberg's" (curly, from seed/CMS text) matches a term written
 *   with a straight apostrophe or without one.
 * - Matching is case-insensitive.
 * - A conservative inflection check covers plural -s/-es, past -ed, and
 *   progressive -ing (plus simple consonant-doubling / -e-drop spelling
 *   variants: stun/stunned, hope/hoping). Irregular forms (e.g. lay→laid)
 *   are intentionally NOT covered — aggressive stemming risks false
 *   matches, which is worse than a missed match (falls back to the
 *   "Words in this story" section, which already handles zero-match
 *   levels correctly).
 * - This only changes matching logic — no new word/meaning data is
 *   invented for terms absent from the body (task constraint).
 *
 * The pure matching functions (tokenizeSentence, buildWordSequences,
 * findMatchedRuns, etc.) live in src/lib/wordMatcher.ts so they can be unit
 * tested without rendering React (see src/lib/wordMatcher.test.ts).
 *
 * ALL words clickable (design-decisions.md §4.8-1): a word token that isn't
 * part of a curated Word[] match is still wrapped in ClickableWordToken —
 * `entry` is null for it. Clicking opens the same SmartDictionary component
 * with a minimal entry (term only, meaning_ko: null) — never a fabricated
 * meaning — the dictionary gloss when there is one, the empty card when
 * there is not. Save works either way, so the
 * word can land in My Vocabulary marked "뜻 미등록" (per session.ts
 * SavedWordEntry.meaning_ko: string | null).
 *
 * Key-word inline gloss / "ruby" (design-decisions.md §4.8-3): a curated
 * Word with isKey === true gets a small Korean gloss rendered under its
 * FIRST occurrence across the whole article body (not every occurrence —
 * repeating it would clutter the reading flow and fight the 1.7 line-height
 * budget). Subsequent occurrences render as a normal clickable word. Uses
 * native <ruby>/<rt> so no extra layout engine is needed and the browser
 * handles the stacked-glyph positioning; sized down via --fs-xs and kept to
 * the accent-muted color so it doesn't compete with the English text.
 *
 * Sentence save (design-decisions.md §4.7 item 2): tapping anywhere in a
 * sentence's non-word area opens a small "문장 저장 / 저장 해제" popover.
 * Word clicks take priority — ClickableWordToken's onClick calls
 * stopPropagation so the sentence <p> handler never fires for a word tap.
 * Saved sentences get a subtle highlighter-style background (a3 mood:
 * warm, not a garish yellow — uses --color-accent-soft, same family as the
 * word hover highlight, so it reads as "part of this design system").
 */

export function ArticleBody({
  articleId,
  level,
  sentences,
  words,
  glosses = {},
}: {
  articleId: string;
  level: CefrLevel;
  sentences: string[];
  words: Word[];
  /**
   * Dictionary meanings for the words this body contains, keyed by lowercased
   * surface form (supabase/migrations/0006_glosses.sql). The curated `words`
   * above still win where both exist — they carry an in-context example and a
   * pronunciation that a gloss does not.
   *
   * Defaults to empty so a caller with no dictionary (a test, the committed
   * seed) behaves exactly as this component did before glosses existed.
   */
  glosses?: Record<string, Gloss>;
}) {
  const { session, refresh } = useSession();
  const [active, setActive] = useState<{
    word: Word | DictionaryEntry;
    rect: DOMRect | null;
    ref: React.RefObject<HTMLElement | null>;
  } | null>(null);
  const [activeSentence, setActiveSentence] = useState<{
    index: number;
    rect: DOMRect | null;
    ref: React.RefObject<HTMLElement | null>;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sequences = buildWordSequences(words);

  function handleWordClick(
    entry: Word | null,
    text: string,
    el: HTMLElement,
    refObj: React.RefObject<HTMLElement | null>
  ) {
    refresh();
    // Curated word first, then the dictionary, then the honest empty card.
    // The third case is not a failure state — a proper noun has no gloss by
    // design (pipeline/src/pipeline/glossary.ts), and inventing one there
    // would be asserting something about the world.
    const gloss = entry ? null : glosses[lookupKey(text)];
    const dictEntry: Word | DictionaryEntry =
      entry ?? {
        term: text,
        pronunciation: null,
        meaning_ko: gloss?.meaning_ko ?? null,
        example: null,
        pos: gloss?.pos ?? null,
      };
    setActive({ word: dictEntry, rect: el.getBoundingClientRect(), ref: refObj });
  }

  function handleSentenceClick(
    sIdx: number,
    el: HTMLElement,
    refObj: React.RefObject<HTMLElement | null>
  ) {
    setActiveSentence({ index: sIdx, rect: el.getBoundingClientRect(), ref: refObj });
  }

  function handleToggleSentenceSaved(sIdx: number, text: string) {
    session.toggleSavedSentence({
      articleId,
      level,
      sentenceIndex: sIdx,
      text,
      savedAt: new Date().toISOString(),
    });
    refresh();
  }

  // Tracks which curated (isKey) word ids have already shown their inline
  // gloss, across the WHOLE body — not per-sentence — so only the article's
  // first occurrence of each key word gets the ruby annotation (§4.8-3).
  // Recreated fresh on every render, which is correct here: the level
  // switch remounts ArticleBody via `key={version.id}` in ArticleViewer, and
  // within a single render pass this Set only needs to dedupe once anyway.
  const shownKeyWordIds = new Set<string>();

  return (
    <div ref={containerRef}>
      <div className="briefly-article-body">
        {sentences.map((sentence, sIdx) => {
          const tokens = tokenizeSentence(sentence);
          const runs = findMatchedRuns(tokens, sequences);
          const runByStart = new Map(runs.map((r) => [r.startIdx, r]));
          const insideRun = new Set<number>();
          for (const r of runs) {
            for (let i = r.startIdx; i <= r.endIdx; i++) insideRun.add(i);
          }

          const rendered: React.ReactNode[] = [];
          let tIdx = 0;
          while (tIdx < tokens.length) {
            const tok = tokens[tIdx];
            const run = runByStart.get(tIdx);
            if (run) {
              const text = tokens
                .slice(run.startIdx, run.endIdx + 1)
                .map((t) => t.text)
                .join("");
              const wordSaved = session.isWordSaved(text);
              const showKeyGloss = Boolean(run.entry.isKey) && !shownKeyWordIds.has(run.entry.id);
              if (showKeyGloss) shownKeyWordIds.add(run.entry.id);
              rendered.push(
                <ClickableWordToken
                  key={tIdx}
                  text={text}
                  entry={run.entry}
                  saved={wordSaved}
                  keyGloss={showKeyGloss ? run.entry.meaning_ko : null}
                  onActivate={handleWordClick}
                />,
              );
              tIdx = run.endIdx + 1;
              continue;
            }
            if (!insideRun.has(tIdx)) {
              if (tok.isWord) {
                // §4.8-1: every word is clickable, even without a curated
                // curated entry. entry=null -> gloss lookup, then empty card.
                const wordSaved = session.isWordSaved(tok.text);
                rendered.push(
                  <ClickableWordToken
                    key={tIdx}
                    text={tok.text}
                    entry={null}
                    saved={wordSaved}
                    keyGloss={null}
                    onActivate={handleWordClick}
                  />,
                );
              } else {
                rendered.push(<span key={tIdx}>{tok.text}</span>);
              }
            }
            tIdx += 1;
          }

          const sentenceSaved = session.isSentenceSaved(articleId, level, sIdx);

          return (
            <SentenceParagraph
              key={sIdx}
              sentenceSaved={sentenceSaved}
              onActivate={(el, ref) => handleSentenceClick(sIdx, el, ref)}
            >
              {rendered}
            </SentenceParagraph>
          );
        })}
      </div>

      {active && (
        <SmartDictionary
          entry={active.word}
          anchorRect={active.rect}
          onClose={() => setActive(null)}
          returnFocusRef={active.ref}
        />
      )}

      {activeSentence && (
        <SentenceActionPopover
          saved={session.isSentenceSaved(articleId, level, activeSentence.index)}
          anchorRect={activeSentence.rect}
          onToggle={() =>
            handleToggleSentenceSaved(activeSentence.index, sentences[activeSentence.index])
          }
          onClose={() => setActiveSentence(null)}
          returnFocusRef={activeSentence.ref}
        />
      )}
    </div>
  );
}

/**
 * Wraps one sentence's rendered tokens. Click on the paragraph (i.e. any
 * non-word area, since word tokens stopPropagation) opens the sentence
 * action popover. Keyboard users can Enter/Space on the paragraph itself
 * (role="button" on a wrapping span would conflict with the word buttons
 * inside, so the paragraph carries a lighter affordance: tabIndex + key
 * handler, without role="button" to avoid double-announcing every word
 * inside it as part of one giant button for screen readers).
 */
function SentenceParagraph({
  sentenceSaved,
  onActivate,
  children,
}: {
  sentenceSaved: boolean;
  onActivate: (el: HTMLElement, ref: React.RefObject<HTMLElement | null>) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  return (
    <p
      ref={ref}
      lang="en"
      tabIndex={0}
      aria-label={sentenceSaved ? "저장된 문장, 문장 저장 액션 열기" : "문장 저장 액션 열기"}
      data-sentence-saved={sentenceSaved}
      className="briefly-sentence"
      onClick={(e) => {
        if (e.currentTarget !== e.target && (e.target as HTMLElement).closest(".briefly-word")) {
          return;
        }
        if (ref.current) onActivate(ref.current, ref);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if ((e.target as HTMLElement).closest(".briefly-word")) return;
          e.preventDefault();
          if (ref.current) onActivate(ref.current, ref);
        }
      }}
      style={{
        fontFamily: "var(--font-en)",
        fontSize: "calc(var(--fs-body) * var(--reading-scale))",
        lineHeight: "var(--lh-body)",
        color: "var(--color-text)",
        marginBottom: "var(--sp-5)",
        cursor: "pointer",
        borderRadius: "4px",
      }}
    >
      {children}
    </p>
  );
}

/**
 * `entry` is null for a word with no curated dictionary match — it's still
 * fully clickable (§4.8-1), just opens the gloss or the empty card instead
 * of the full Smart Dictionary entry (see handleWordClick in ArticleBody).
 *
 * `keyGloss` (§4.8-3): non-null only for the FIRST occurrence of an isKey
 * curated word. Renders a native <ruby>/<rt> stack so the Korean meaning
 * sits in small text directly under the English word, without disrupting
 * the surrounding line's baseline/height budget (ruby annotations reserve
 * their own line-box above the base text without stretching --lh-body for
 * neighboring lines that have no ruby).
 */
function ClickableWordToken({
  text,
  entry,
  saved,
  keyGloss,
  onActivate,
}: {
  text: string;
  entry: Word | null;
  saved: boolean;
  keyGloss?: string | null;
  onActivate: (
    entry: Word | null,
    text: string,
    el: HTMLElement,
    ref: React.RefObject<HTMLElement | null>
  ) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const hasGloss = Boolean(keyGloss);

  const inner = hasGloss ? (
    <ruby className="briefly-word-ruby">
      {text}
      <rt lang="ko">{keyGloss}</rt>
    </ruby>
  ) : (
    text
  );

  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      className="briefly-word"
      data-saved={saved}
      data-has-entry={entry != null}
      aria-label={`${text}, 뜻 보기${saved ? " (저장한 단어)" : ""}${
        hasGloss ? `, 핵심 단어, 뜻: ${keyGloss}` : ""
      }`}
      onClick={(e) => {
        e.stopPropagation();
        if (ref.current) onActivate(entry, text, ref.current, ref);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          if (ref.current) onActivate(entry, text, ref.current, ref);
        }
      }}
    >
      {inner}
    </span>
  );
}
