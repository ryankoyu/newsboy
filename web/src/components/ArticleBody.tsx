"use client";

import { useRef, useState } from "react";
import type { CefrLevel, Word } from "@/lib/types";
import { SmartDictionary } from "@/components/SmartDictionary";
import { SentenceActionPopover } from "@/components/SentenceActionPopover";
import { useSession } from "@/lib/useSession";
import {
  tokenizeSentence,
  buildWordSequences,
  findMatchedRuns,
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
 * - seen words get a dotted underline; SAVED words get a filled highlight
 *   instead (design-decisions.md §4.7 item 3 — a stronger, distinct style
 *   from "seen" so a saved word stands out on revisit).
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
}: {
  articleId: string;
  level: CefrLevel;
  sentences: string[];
  words: Word[];
}) {
  const { session, refresh } = useSession();
  const [active, setActive] = useState<{
    word: Word;
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
    entry: Word,
    text: string,
    el: HTMLElement,
    refObj: React.RefObject<HTMLElement | null>
  ) {
    session.markWordSeen(text);
    refresh();
    setActive({ word: entry, rect: el.getBoundingClientRect(), ref: refObj });
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
              const seen = session.isWordSeen(text);
              const wordSaved = session.isWordSaved(text);
              rendered.push(
                <ClickableWordToken
                  key={tIdx}
                  text={text}
                  entry={run.entry}
                  seen={seen}
                  saved={wordSaved}
                  onActivate={handleWordClick}
                />,
              );
              tIdx = run.endIdx + 1;
              continue;
            }
            if (!insideRun.has(tIdx)) {
              rendered.push(<span key={tIdx}>{tok.text}</span>);
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

function ClickableWordToken({
  text,
  entry,
  seen,
  saved,
  onActivate,
}: {
  text: string;
  entry: Word;
  seen: boolean;
  saved: boolean;
  onActivate: (
    entry: Word,
    text: string,
    el: HTMLElement,
    ref: React.RefObject<HTMLElement | null>
  ) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      role="button"
      tabIndex={0}
      className="briefly-word"
      data-seen={seen}
      data-saved={saved}
      aria-label={`${text}, 뜻 보기${saved ? " (저장한 단어)" : ""}`}
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
      {text}
    </span>
  );
}
