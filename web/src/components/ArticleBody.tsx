"use client";

import { useRef, useState } from "react";
import type { Word } from "@/lib/types";
import { SmartDictionary } from "@/components/SmartDictionary";
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
 * - seen words get a dotted underline
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
 */

export function ArticleBody({
  sentences,
  words,
}: {
  sentences: string[];
  words: Word[];
}) {
  const { session, refresh } = useSession();
  const [active, setActive] = useState<{
    word: Word;
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
              rendered.push(
                <ClickableWordToken
                  key={tIdx}
                  text={text}
                  entry={run.entry}
                  seen={seen}
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

          return (
            <p
              key={sIdx}
              lang="en"
              style={{
                fontFamily: "var(--font-en)",
                fontSize: "calc(var(--fs-body) * var(--reading-scale))",
                lineHeight: "var(--lh-body)",
                color: "var(--color-text)",
                marginBottom: "var(--sp-5)",
              }}
            >
              {rendered}
            </p>
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
    </div>
  );
}

function ClickableWordToken({
  text,
  entry,
  seen,
  onActivate,
}: {
  text: string;
  entry: Word;
  seen: boolean;
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
      aria-label={`${text}, 뜻 보기`}
      onClick={() => ref.current && onActivate(entry, text, ref.current, ref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (ref.current) onActivate(entry, text, ref.current, ref);
        }
      }}
    >
      {text}
    </span>
  );
}
