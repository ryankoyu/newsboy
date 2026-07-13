/**
 * Session (user-state) abstraction.
 *
 * Auth is explicitly out of scope for this phase (coordinator instruction,
 * 2026-07-10). Everything a signed-in user would eventually own — CEFR
 * level, reading font size, theme, bookmarks, read articles, onboarding
 * status — lives behind this interface so a Supabase-backed implementation
 * can replace `localSessionStore` later without touching call sites.
 *
 * All reads/writes are synchronous (localStorage), but the interface shape
 * intentionally looks swap-friendly: small, focused getters/setters keyed by
 * concept rather than one big blob, so a future async Supabase provider can
 * implement the same shape with promises if needed (see note at bottom).
 */

import type { CefrLevel } from "@/lib/types";

export type ReadingScale = "S" | "M" | "L" | "XL";
export type ThemePref = "light" | "dark" | "system";

export const READING_SCALE_VALUE: Record<ReadingScale, number> = {
  S: 0.875,
  M: 1,
  L: 1.125,
  XL: 1.25,
};

export interface SessionStore {
  /** User's CEFR level (default reading level for cards + viewer). */
  getLevel(): CefrLevel;
  setLevel(level: CefrLevel): void;

  /** Reading font-size scale (S/M/L/XL), a3-ui-ux.md §3-4. */
  getFontSize(): ReadingScale;
  setFontSize(scale: ReadingScale): void;

  /** Theme preference. "system" defers to prefers-color-scheme. */
  getTheme(): ThemePref;
  setTheme(theme: ThemePref): void;

  /** Has the user completed onboarding (signup->level->done)? */
  hasOnboarded(): boolean;
  setOnboarded(done: boolean): void;

  /**
   * Has the user dismissed the non-intrusive home "1분 레벨 진단하기" banner
   * (design-decisions.md §4.6 — onboarding is never forced; home is
   * immediately viewable, with a dismissible banner nudging level setup)?
   */
  hasDismissedOnboardingBanner(): boolean;
  dismissOnboardingBanner(): void;

  /** Bookmarked article ids (Saved tab). */
  getBookmarks(): string[];
  isBookmarked(articleId: string): boolean;
  toggleBookmark(articleId: string): boolean; // returns new state

  /** Read article ids (a3-ui-ux.md §3-3 "읽음" marker). */
  getReadArticles(): string[];
  isRead(articleId: string): boolean;
  markRead(articleId: string): void;

  /**
   * Timestamped read events (enhancement-plan.md Batch 1 #3 — weekly brief +
   * streak need "when" an article was read, not just "which"). Old entries
   * persisted before this field existed have no timestamp and are excluded
   * from weekly/streak aggregation (never backfilled/invented — see
   * lib/weeklyBrief.ts).
   */
  getReadEvents(): ReadEvent[];

  /** Words the user has looked up at least once ("본 적 있음" dotted underline). */
  getSeenWords(): string[];
  isWordSeen(term: string): boolean;
  markWordSeen(term: string): void;

  /** Saved words (My Vocabulary, surfaced minimally in Saved tab). */
  getSavedWords(): SavedWordEntry[];
  isWordSaved(term: string): boolean;
  toggleSavedWord(entry: SavedWordEntry): boolean; // returns new state

  /**
   * Saved sentences (design-decisions.md §4.7 — sentence save from the
   * article body, surfaced in the My page "문장" drawer).
   */
  getSavedSentences(): SavedSentenceEntry[];
  isSentenceSaved(articleId: string, level: CefrLevel, sentenceIndex: number): boolean;
  toggleSavedSentence(entry: SavedSentenceEntry): boolean; // returns new state

  /** Display name, if the user set one during onboarding (optional, local only). */
  getDisplayName(): string | null;
  setDisplayName(name: string | null): void;
}

export interface SavedWordEntry {
  term: string;
  /**
   * null/undefined = "뜻 미등록" (design-decisions.md §4.8-1): the word was
   * saved from a card with no dictionary entry yet. Never fabricate a
   * meaning to fill this in — it stays unset until a real dictionary/LLM
   * lookup backfills it later.
   */
  meaning_ko: string | null;
  /**
   * ISO timestamp of when the word was saved (enhancement-plan.md Batch 1
   * #3 — weekly brief needs "words newly saved this week"). Optional/absent
   * on entries persisted before this field existed (migrated, not
   * backfilled — see migrateSessionShape below).
   */
  savedAt?: string;
}

/** A single timestamped "read this article" event (weekly brief + streak). */
export interface ReadEvent {
  articleId: string;
  /** ISO timestamp. */
  readAt: string;
}

export interface SavedSentenceEntry {
  articleId: string;
  level: CefrLevel;
  sentenceIndex: number;
  /** Snapshot of the sentence text at save time (survives content edits). */
  text: string;
  savedAt: string; // ISO timestamp
}

const STORAGE_KEY = "briefly:session:v1";

interface PersistedShape {
  level: CefrLevel;
  fontSize: ReadingScale;
  theme: ThemePref;
  onboarded: boolean;
  onboardingBannerDismissed: boolean;
  bookmarks: string[];
  readArticles: string[];
  /**
   * Timestamped counterpart of readArticles (added enhancement-plan.md Batch
   * 1 #3). readArticles stays the source of truth for "is this read at
   * all"; readEvents is additive and only gains entries going forward —
   * pre-existing readArticles entries from before this field existed have
   * no corresponding readEvents entry (no timestamp to invent, so they're
   * simply excluded from weekly/streak aggregation).
   */
  readEvents: ReadEvent[];
  seenWords: string[];
  savedWords: SavedWordEntry[];
  savedSentences: SavedSentenceEntry[];
  displayName: string | null;
}

const DEFAULTS: PersistedShape = {
  level: "A2",
  fontSize: "M",
  theme: "system",
  onboarded: false,
  onboardingBannerDismissed: false,
  bookmarks: [],
  readArticles: [],
  readEvents: [],
  seenWords: [],
  savedWords: [],
  savedSentences: [],
  displayName: null,
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function load(): PersistedShape {
  if (!isBrowser()) return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    // Migration (enhancement-plan.md Batch 1 #3): older persisted blobs
    // predate readEvents/savedAt-on-words. Merge with defaults rather than
    // backfilling fake timestamps — untimestamped history is simply
    // unavailable to weekly/streak aggregation (CLAUDE.md rule 1).
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state: PersistedShape): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable (private mode etc.) — fail silently, state
    // just won't persist across reloads. Not worth surfacing to the user.
  }
}

/**
 * localStorage-backed implementation of SessionStore.
 *
 * NOTE: reads re-read from localStorage each call rather than caching in
 * memory, so multiple components/tabs stay eventually-consistent without a
 * pub/sub layer. Fine at this scale (small JSON blob, infrequent writes).
 */
export const localSessionStore: SessionStore = {
  getLevel() {
    return load().level;
  },
  setLevel(level) {
    const s = load();
    s.level = level;
    save(s);
  },

  getFontSize() {
    return load().fontSize;
  },
  setFontSize(scale) {
    const s = load();
    s.fontSize = scale;
    save(s);
  },

  getTheme() {
    return load().theme;
  },
  setTheme(theme) {
    const s = load();
    s.theme = theme;
    save(s);
  },

  hasOnboarded() {
    return load().onboarded;
  },
  setOnboarded(done) {
    const s = load();
    s.onboarded = done;
    save(s);
  },

  hasDismissedOnboardingBanner() {
    return load().onboardingBannerDismissed;
  },
  dismissOnboardingBanner() {
    const s = load();
    s.onboardingBannerDismissed = true;
    save(s);
  },

  getBookmarks() {
    return load().bookmarks;
  },
  isBookmarked(articleId) {
    return load().bookmarks.includes(articleId);
  },
  toggleBookmark(articleId) {
    const s = load();
    const has = s.bookmarks.includes(articleId);
    s.bookmarks = has
      ? s.bookmarks.filter((id) => id !== articleId)
      : [...s.bookmarks, articleId];
    save(s);
    return !has;
  },

  getReadArticles() {
    return load().readArticles;
  },
  isRead(articleId) {
    return load().readArticles.includes(articleId);
  },
  markRead(articleId) {
    const s = load();
    if (!s.readArticles.includes(articleId)) {
      s.readArticles = [...s.readArticles, articleId];
      s.readEvents = [...s.readEvents, { articleId, readAt: new Date().toISOString() }];
      save(s);
    }
  },

  getReadEvents() {
    return load().readEvents;
  },

  getSeenWords() {
    return load().seenWords;
  },
  isWordSeen(term) {
    return load().seenWords.includes(term.toLowerCase());
  },
  markWordSeen(term) {
    const key = term.toLowerCase();
    const s = load();
    if (!s.seenWords.includes(key)) {
      s.seenWords = [...s.seenWords, key];
      save(s);
    }
  },

  getSavedWords() {
    return load().savedWords;
  },
  isWordSaved(term) {
    const key = term.toLowerCase();
    return load().savedWords.some((w) => w.term.toLowerCase() === key);
  },
  toggleSavedWord(entry) {
    const key = entry.term.toLowerCase();
    const s = load();
    const has = s.savedWords.some((w) => w.term.toLowerCase() === key);
    s.savedWords = has
      ? s.savedWords.filter((w) => w.term.toLowerCase() !== key)
      : [...s.savedWords, { ...entry, savedAt: entry.savedAt ?? new Date().toISOString() }];
    save(s);
    return !has;
  },

  getSavedSentences() {
    return load().savedSentences;
  },
  isSentenceSaved(articleId, level, sentenceIndex) {
    return load().savedSentences.some(
      (e) =>
        e.articleId === articleId &&
        e.level === level &&
        e.sentenceIndex === sentenceIndex
    );
  },
  toggleSavedSentence(entry) {
    const s = load();
    const has = s.savedSentences.some(
      (e) =>
        e.articleId === entry.articleId &&
        e.level === entry.level &&
        e.sentenceIndex === entry.sentenceIndex
    );
    s.savedSentences = has
      ? s.savedSentences.filter(
          (e) =>
            !(
              e.articleId === entry.articleId &&
              e.level === entry.level &&
              e.sentenceIndex === entry.sentenceIndex
            )
        )
      : [...s.savedSentences, entry];
    save(s);
    return !has;
  },

  getDisplayName() {
    return load().displayName;
  },
  setDisplayName(name) {
    const s = load();
    s.displayName = name;
    save(s);
  },
};

/**
 * Entry point the rest of the app imports. Swap this for a Supabase-backed
 * SessionStore (likely async — the interface above would need Promise
 * return types at that point) when auth ships.
 */
export const sessionStore: SessionStore = localSessionStore;
