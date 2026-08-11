"use client";

import { useState } from "react";
import type { CefrLevel, Word } from "@/lib/types";
import type { DictionaryEntry } from "@/components/SmartDictionary";
import { SentenceActionPopover } from "@/components/SentenceActionPopover";
import { useSession } from "@/lib/useSession";
import { buildWordSequences, findMatchedRuns, tokenizeSentence } from "@/lib/wordMatcher";

/**
 * Article body, newsprint skin — design_handoff_newsprint_skin, "Article
 * Reader" + "Interactions & Behavior".
 *
 * Two things differ from the standard `ArticleBody`, both required by the
 * handoff:
 *
 * 1. **Continuous justified prose.** The data model stores content as
 *    `sentences: string[]`, and the standard body sets one sentence per
 *    paragraph. Justification and a drop cap need multi-line blocks, so
 *    sentences are grouped into paragraphs here. Each sentence stays its own
 *    interactive span, so sentence-level highlight and save are unaffected —
 *    this is a typesetting choice, not a change to the content.
 * 2. **The dictionary opens inline, beneath the paragraph**, pushing content
 *    down instead of floating over it, so the reader's position on the page
 *    is preserved. (Sentence actions keep the existing popover — the handoff
 *    only moves the word panel.)
 *
 * Word matching, the "every word is clickable" rule and the key-word ruby
 * gloss are unchanged from `ArticleBody`; they reuse the same pure helpers in
 * lib/wordMatcher.ts, so there is one matching implementation, not two.
 */

/** Sentences per typeset paragraph. Newspaper paragraphs are short. */
const SENTENCES_PER_PARAGRAPH = 3;

const DISPLAY = "var(--font-display), Georgia, serif";

export function NewsprintArticleBody({
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
  // activeWord and activeSentence are mutually exclusive (handoff, "State
  // Management") — opening one closes the other.
  const [activeWord, setActiveWord] = useState<{
    entry: Word | DictionaryEntry;
    paragraph: number;
  } | null>(null);
  const [activeSentence, setActiveSentence] = useState<{
    index: number;
    rect: DOMRect | null;
  } | null>(null);

  const sequences = buildWordSequences(words);

  // Group sentences into paragraphs, keeping each sentence's original index
  // so save/highlight state stays keyed to the data, not to the typesetting.
  const paragraphs: Array<Array<{ text: string; index: number }>> = [];
  sentences.forEach((text, index) => {
    const p = Math.floor(index / SENTENCES_PER_PARAGRAPH);
    (paragraphs[p] ??= []).push({ text, index });
  });

  // Only the article's FIRST occurrence of each key word carries the ruby
  // gloss. Rebuilt every render, which is correct: a level switch remounts
  // this component, and one render pass only needs to dedupe once.
  const shownKeyWordIds = new Set<string>();

  function openWord(entry: Word | null, text: string, paragraph: number) {
    session.markWordSeen(text);
    setActiveSentence(null);
    setActiveWord({
      entry: entry ?? { term: text, pronunciation: null, meaning_ko: null, example: null },
      paragraph,
    });
    refresh();
  }

  function openSentence(index: number, el: HTMLElement) {
    setActiveWord(null);
    setActiveSentence({ index, rect: el.getBoundingClientRect() });
  }

  return (
    // lang is what makes `hyphens: auto` work — without a language the
    // browser has no dictionary to break on, and justified 17px text in a
    // 394px column opens rivers of white space instead.
    <div lang="en">
      {paragraphs.map((group, pIdx) => (
        <div key={pIdx}>
          <p
            lang="en"
            className={`np-body ${pIdx === 0 ? "np-dropcap" : "np-body--runon"}`}
            style={{ margin: 0 }}
          >
            {group.map(({ text, index }) => {
              const tokens = tokenizeSentence(text);
              const runs = findMatchedRuns(tokens, sequences);
              const runByStart = new Map(runs.map((r) => [r.startIdx, r]));
              const insideRun = new Set<number>();
              for (const r of runs) {
                for (let i = r.startIdx; i <= r.endIdx; i++) insideRun.add(i);
              }

              const rendered: React.ReactNode[] = [];
              let tIdx = 0;
              while (tIdx < tokens.length) {
                const run = runByStart.get(tIdx);
                if (run) {
                  const runText = tokens
                    .slice(run.startIdx, run.endIdx + 1)
                    .map((t) => t.text)
                    .join("");
                  const showGloss =
                    Boolean(run.entry.isKey) && !shownKeyWordIds.has(run.entry.id);
                  if (showGloss) shownKeyWordIds.add(run.entry.id);
                  rendered.push(
                    <WordToken
                      key={tIdx}
                      text={runText}
                      saved={session.isWordSaved(runText)}
                      curated
                      gloss={showGloss ? run.entry.meaning_ko : null}
                      onActivate={() => openWord(run.entry, runText, pIdx)}
                    />
                  );
                  tIdx = run.endIdx + 1;
                  continue;
                }
                if (!insideRun.has(tIdx)) {
                  const tok = tokens[tIdx];
                  rendered.push(
                    tok.isWord ? (
                      <WordToken
                        key={tIdx}
                        text={tok.text}
                        saved={session.isWordSaved(tok.text)}
                        curated={false}
                        gloss={null}
                        onActivate={() => openWord(null, tok.text, pIdx)}
                      />
                    ) : (
                      <span key={tIdx}>{tok.text}</span>
                    )
                  );
                }
                tIdx += 1;
              }

              return (
                <span
                  key={index}
                  className="np-sentence"
                  data-active={activeSentence?.index === index ? "true" : undefined}
                  data-saved={
                    session.isSentenceSaved(articleId, level, index) ? "true" : undefined
                  }
                  tabIndex={0}
                  onClick={(e) => openSentence(index, e.currentTarget)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openSentence(index, e.currentTarget);
                    }
                  }}
                >
                  {rendered}{" "}
                </span>
              );
            })}
          </p>

          {/* The panel lands directly under the paragraph the word is in, so
              the reader's eye does not lose its place. */}
          {activeWord?.paragraph === pIdx && (
            <InlineDictionary entry={activeWord.entry} onClose={() => setActiveWord(null)} />
          )}
        </div>
      ))}

      {activeSentence && (
        <SentenceActionPopover
          saved={session.isSentenceSaved(articleId, level, activeSentence.index)}
          anchorRect={activeSentence.rect}
          onToggle={() => {
            session.toggleSavedSentence({
              articleId,
              level,
              sentenceIndex: activeSentence.index,
              text: sentences[activeSentence.index],
              savedAt: new Date().toISOString(),
            });
            refresh();
          }}
          onClose={() => setActiveSentence(null)}
        />
      )}
    </div>
  );
}

/** One tappable word — dotted action-coloured rule, optional ruby gloss. */
function WordToken({
  text,
  saved,
  curated,
  gloss,
  onActivate,
}: {
  text: string;
  saved: boolean;
  /** Has a curated dictionary entry — only these carry the dotted rule. */
  curated: boolean;
  gloss: string | null;
  onActivate: () => void;
}) {
  const body = (
    <span
      className="np-word"
      data-curated={curated ? "true" : undefined}
      data-saved={saved ? "true" : undefined}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Word clicks win over the sentence handler wrapping them.
        e.stopPropagation();
        onActivate();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onActivate();
        }
      }}
    >
      {text}
    </span>
  );
  if (!gloss) return body;
  return (
    <ruby className="np-word-ruby">
      {body}
      <rt>{gloss}</rt>
    </ruby>
  );
}

/**
 * The dictionary, set as a ruled box in the column rather than a floating
 * card. Row 1 word + IPA + save, row 2 Korean gloss, row 3 the example
 * sentence in italic (handoff, "Article Reader").
 */
function InlineDictionary({
  entry,
  onClose,
}: {
  entry: Word | DictionaryEntry;
  onClose: () => void;
}) {
  const { session, refresh } = useSession();
  const saved = session.isWordSaved(entry.term);
  const pos = "pos" in entry ? entry.pos : null;

  return (
    <aside
      style={{
        margin: "12px 0",
        border: "1px solid var(--rule-mid)",
        padding: "12px 14px",
        background: "rgba(255,250,235,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontStretch: "82%", fontSize: 20 }}>
          {entry.term}
        </span>
        {entry.pronunciation && (
          <span
            style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-muted)" }}
          >
            {entry.pronunciation}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => {
            session.toggleSavedWord({
              term: entry.term,
              meaning_ko: entry.meaning_ko ?? null,
              savedAt: new Date().toISOString(),
            });
            refresh();
          }}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            fontFamily: "var(--font-ui)",
            fontSize: 11.5,
            color: "var(--action)",
          }}
        >
          {saved ? "단어장에서 빼기" : "단어장 담기"}
        </button>
      </div>

      <p
        style={{
          margin: "7px 0 0",
          fontFamily: "var(--font-ui)",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "#26221c",
        }}
      >
        {/* Never fabricate a meaning — an unglossed word says so (design-
            decisions.md 규칙 1, and session.ts SavedWordEntry.meaning_ko). */}
        {entry.meaning_ko
          ? `${pos ? `${pos} ` : ""}${entry.meaning_ko}`
          : "뜻 준비 중이에요. 담아두면 사전이 업데이트될 때 알려드릴게요."}
      </p>

      {entry.example && (
        <p
          style={{
            margin: "7px 0 0",
            fontSize: 12.5,
            lineHeight: 1.5,
            fontStyle: "italic",
            color: "var(--ink-soft)",
          }}
        >
          “{entry.example}”
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            color: "var(--ink-muted)",
          }}
        >
          닫기
        </button>
      </div>
    </aside>
  );
}
