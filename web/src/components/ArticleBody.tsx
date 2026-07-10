"use client";

import { useRef, useState } from "react";
import type { Word } from "@/lib/types";
import { SmartDictionary } from "@/components/SmartDictionary";
import { useSession } from "@/lib/useSession";

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
 */

// Split a sentence into tokens, keeping punctuation/whitespace as separate
// non-clickable tokens. A "word" token = letters, digits, apostrophes,
// hyphens (so "well-known" and "Zuckerberg's" stay one token).
const WORD_RE = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

function tokenizeSentence(sentence: string): Array<{ text: string; isWord: boolean }> {
  const tokens: Array<{ text: string; isWord: boolean }> = [];
  let lastIndex = 0;
  for (const match of sentence.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push({ text: sentence.slice(lastIndex, start), isWord: false });
    }
    tokens.push({ text: match[0], isWord: true });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < sentence.length) {
    tokens.push({ text: sentence.slice(lastIndex), isWord: false });
  }
  return tokens;
}

function lookupKey(raw: string): string {
  return raw.toLowerCase();
}

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

  // Build a lookup map: lemma -> Word entry. Falls back to fuzzy contains
  // match for multi-word terms like "lay off".
  const wordMap = new Map<string, Word>();
  for (const w of words) {
    wordMap.set(lookupKey(w.term.replace(/\s*\(.*?\)\s*/g, "")), w);
  }

  function findWordEntry(raw: string): Word | null {
    const key = lookupKey(raw);
    if (wordMap.has(key)) return wordMap.get(key)!;
    // Multi-word terms (e.g. "lay off") won't match a single token; check
    // if this token is the start of any multi-word term.
    for (const w of words) {
      const cleanTerm = lookupKey(w.term.replace(/\s*\(.*?\)\s*/g, ""));
      if (cleanTerm.split(/\s+/)[0] === key && cleanTerm.includes(" ")) {
        return w;
      }
    }
    return null;
  }

  function handleWordClick(
    raw: string,
    el: HTMLElement,
    refObj: React.RefObject<HTMLElement | null>
  ) {
    const entry = findWordEntry(raw);
    if (!entry) return; // Word not in the curated list — not clickable-meaningful.
    session.markWordSeen(raw);
    refresh();
    setActive({ word: entry, rect: el.getBoundingClientRect(), ref: refObj });
  }

  return (
    <div ref={containerRef}>
      <div className="briefly-article-body">
        {sentences.map((sentence, sIdx) => {
          const tokens = tokenizeSentence(sentence);
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
              {tokens.map((tok, tIdx) => {
                if (!tok.isWord) return <span key={tIdx}>{tok.text}</span>;
                const entry = findWordEntry(tok.text);
                const seen = session.isWordSeen(tok.text);
                if (!entry) return <span key={tIdx}>{tok.text}</span>;
                return (
                  <ClickableWordToken
                    key={tIdx}
                    text={tok.text}
                    seen={seen}
                    onActivate={handleWordClick}
                  />
                );
              })}
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
  seen,
  onActivate,
}: {
  text: string;
  seen: boolean;
  onActivate: (raw: string, el: HTMLElement, ref: React.RefObject<HTMLElement | null>) => void;
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
      onClick={() => ref.current && onActivate(text, ref.current, ref)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (ref.current) onActivate(text, ref.current, ref);
        }
      }}
    >
      {text}
    </span>
  );
}
