// Seeds the local session so preview cards can show the *populated* states of
// session-driven screens (My Library, read markers, today's progress) instead
// of a permanently empty first-run account.
//
// It writes through the app's own SessionStore API — no reaching into
// localStorage shape — and every value is taken from the real seed data, so
// nothing here is invented content. Each preview card is its own page, so the
// writes never leak between cells.

import { sessionStore } from "@/lib/session";
import { article, articles, secondArticle, versionOf, wordsForVersion } from "./seed";

// Every preview card is a separate page but they all share one origin, so
// localStorage carries over between them: without an explicit reset, whatever
// the previously-captured card wrote (read markers, a dismissed banner) leaks
// into the next one and makes cards order-dependent. Any preview whose
// component reads the session calls one of these two at module scope.
const STORAGE_KEY = "briefly:session:v1";

/** Pristine first-run account — the default state a card should render in. */
export function resetSession() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* previews only — a blocked localStorage just means the app's own defaults */
  }
}

let seeded = false;

export function seedSession() {
  if (seeded || typeof window === "undefined") return;
  seeded = true;
  resetSession();

  sessionStore.setDisplayName("koyu");
  sessionStore.setLevel("A2");

  // Two of today's ten read, and the first one bookmarked.
  sessionStore.markRead(article.id);
  sessionStore.markRead(secondArticle.id);
  sessionStore.toggleBookmark(article.id);
  if (articles[2]) sessionStore.toggleBookmark(articles[2].id);

  // Three real vocabulary entries from the article's own word list.
  const a2 = versionOf(article, "A2");
  for (const w of wordsForVersion(a2.id).slice(0, 3)) {
    sessionStore.toggleSavedWord({
      term: w.term,
      meaning_ko: w.meaning_ko,
      savedAt: "2026-07-13T09:00:00.000Z",
    });
  }

  // One saved sentence, quoted verbatim from the A2 rewrite.
  if (a2.sentences[0]) {
    sessionStore.toggleSavedSentence({
      articleId: article.id,
      level: "A2",
      sentenceIndex: 0,
      text: a2.sentences[0],
      savedAt: "2026-07-13T09:02:00.000Z",
    });
  }
}
