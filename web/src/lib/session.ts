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

/**
 * Schema version of the blob stored under STORAGE_KEY. The key's own `:v1`
 * suffix was never checked by anything; this field is, on every read and
 * every write. A blob claiming a version this build doesn't know is read
 * best-effort but never overwritten — a newer build's data is not ours to
 * truncate (see `save`).
 */
const SCHEMA_VERSION = 1;

interface PersistedShape {
  schemaVersion: number;
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
  savedWords: SavedWordEntry[];
  savedSentences: SavedSentenceEntry[];
  displayName: string | null;
}

const DEFAULTS: PersistedShape = {
  schemaVersion: SCHEMA_VERSION,
  level: "A2",
  fontSize: "M",
  theme: "system",
  onboarded: false,
  onboardingBannerDismissed: false,
  bookmarks: [],
  readArticles: [],
  readEvents: [],
  savedWords: [],
  savedSentences: [],
  displayName: null,
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// ---------------------------------------------------------------------------
// Storage health (everything the user has learned lives in one localStorage
// key, so a failed write or a corrupted blob is data loss, not a hiccup)
// ---------------------------------------------------------------------------

export type StorageIssueKind =
  /** A write didn't land — quota exhausted, storage disabled, private mode. */
  | "save-failed"
  /** The stored blob had fields of the wrong type; they were reset to defaults. */
  | "data-repaired"
  /** The blob was written by a newer build. Read best-effort, writes blocked. */
  | "newer-schema";

export interface StorageIssue {
  kind: StorageIssueKind;
  /** User-facing, Korean — safe to render as-is. */
  message: string;
  /** What exactly went wrong, for a "자세히" disclosure. */
  detail: string[];
  at: string; // ISO timestamp
}

let currentIssue: StorageIssue | null = null;
const issueListeners = new Set<() => void>();

function reportIssue(kind: StorageIssueKind, message: string, detail: string[] = []): void {
  currentIssue = { kind, message, detail, at: new Date().toISOString() };
  issueListeners.forEach((l) => l());
}

/**
 * The most recent storage problem, or null when everything is fine.
 *
 * Nothing in `web/src/app/` wires this up yet (different owner) — the store
 * exposes the state, the UI decides how to say it. Until it's wired, a failed
 * save is at least recorded here instead of vanishing into a `catch {}`.
 */
export function getStorageIssue(): StorageIssue | null {
  return currentIssue;
}

export function clearStorageIssue(): void {
  currentIssue = null;
  issueListeners.forEach((l) => l());
}

/** Subscribe to storage-health changes (useSyncExternalStore-shaped). */
export function subscribeStorageIssue(listener: () => void): () => void {
  issueListeners.add(listener);
  return () => {
    issueListeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Validation
//
// Everything here answers one question: what happens when the blob isn't the
// shape we wrote? `{"bookmarks": null}` used to sail through JSON.parse and
// blow up later at `.includes(...)`, taking the page with it. A field of the
// wrong type is dropped back to its default; the rest of the user's data
// survives, and the repair is reported rather than hidden.
// ---------------------------------------------------------------------------

const LEVELS: readonly CefrLevel[] = ["A2", "B1", "B2"];
const SCALES: readonly ReadingScale[] = ["S", "M", "L", "XL"];
const THEMES: readonly ThemePref[] = ["light", "dark", "system"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string");
}

function isReadEvent(v: unknown): v is ReadEvent {
  return isRecord(v) && typeof v.articleId === "string" && typeof v.readAt === "string";
}

function isSavedWord(v: unknown): v is SavedWordEntry {
  if (!isRecord(v) || typeof v.term !== "string") return false;
  if (!(v.meaning_ko === null || v.meaning_ko === undefined || typeof v.meaning_ko === "string")) {
    return false;
  }
  return v.savedAt === undefined || typeof v.savedAt === "string";
}

function isSavedSentence(v: unknown): v is SavedSentenceEntry {
  return (
    isRecord(v) &&
    typeof v.articleId === "string" &&
    typeof v.level === "string" &&
    (LEVELS as readonly string[]).includes(v.level) &&
    typeof v.sentenceIndex === "number" &&
    Number.isInteger(v.sentenceIndex) &&
    typeof v.text === "string" &&
    typeof v.savedAt === "string"
  );
}

interface CoerceResult {
  state: PersistedShape;
  /** Field names that had to be reset or partially dropped. */
  repairs: string[];
  /** Stored blob's own schemaVersion, if it declared one. */
  storedVersion: number | null;
}

/**
 * Turns whatever was in localStorage into a PersistedShape we can rely on.
 *
 * Absent fields fall back to defaults (the pre-existing migration path —
 * enhancement-plan.md Batch 1 #3: older blobs predate readEvents/savedAt, and
 * missing timestamps are left missing rather than backfilled with invented
 * ones, CLAUDE.md rule 1). Present-but-wrong-typed fields are the new case:
 * they're reset and named in `repairs`.
 */
function coerce(raw: unknown): CoerceResult {
  const repairs: string[] = [];
  if (!isRecord(raw)) {
    return { state: { ...DEFAULTS }, repairs: ["전체"], storedVersion: null };
  }

  const storedVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : null;

  /** Absent/null = "never written", which is a migration, not a corruption. */
  const present = (key: string): unknown =>
    raw[key] === undefined || raw[key] === null ? undefined : raw[key];

  const scalar = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = present(key);
    if (value === undefined) return fallback;
    const coerced = oneOf(value, allowed, fallback);
    if (value !== coerced) repairs.push(key);
    return coerced;
  };
  const flag = (key: string, fallback: boolean): boolean => {
    const value = present(key);
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") {
      repairs.push(key);
      return fallback;
    }
    return value;
  };
  const ids = (key: string, fallback: string[]): string[] => {
    const value = present(key);
    if (value === undefined) return fallback;
    const arr = stringArray(value);
    if (arr === null) {
      repairs.push(key);
      return fallback;
    }
    if (arr.length !== (value as unknown[]).length) repairs.push(key);
    return arr;
  };
  const entries = <T>(key: string, guard: (v: unknown) => v is T, fallback: T[]): T[] => {
    const value = present(key);
    if (value === undefined) return fallback;
    if (!Array.isArray(value)) {
      repairs.push(key);
      return fallback;
    }
    const kept = value.filter(guard);
    if (kept.length !== value.length) repairs.push(key);
    return kept;
  };

  let displayName = DEFAULTS.displayName;
  if (raw.displayName !== undefined) {
    if (raw.displayName === null || typeof raw.displayName === "string") {
      displayName = raw.displayName;
    } else {
      repairs.push("displayName");
    }
  }

  return {
    state: {
      schemaVersion: SCHEMA_VERSION,
      level: scalar("level", LEVELS, DEFAULTS.level),
      fontSize: scalar("fontSize", SCALES, DEFAULTS.fontSize),
      theme: scalar("theme", THEMES, DEFAULTS.theme),
      onboarded: flag("onboarded", DEFAULTS.onboarded),
      onboardingBannerDismissed: flag(
        "onboardingBannerDismissed",
        DEFAULTS.onboardingBannerDismissed
      ),
      bookmarks: ids("bookmarks", []),
      readArticles: ids("readArticles", []),
      readEvents: entries("readEvents", isReadEvent, []),
      savedWords: entries("savedWords", isSavedWord, []),
      savedSentences: entries("savedSentences", isSavedSentence, []),
      displayName,
    },
    repairs,
    storedVersion,
  };
}

function load(): PersistedShape {
  if (!isBrowser()) return { ...DEFAULTS };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage disabled entirely (some private modes throw on access).
    return { ...DEFAULTS };
  }
  if (!raw) return { ...DEFAULTS };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    reportIssue(
      "data-repaired",
      "저장된 학습 기록을 읽을 수 없어 초기 상태로 시작합니다. 백업 파일이 있으면 불러오기로 복구할 수 있습니다.",
      ["JSON 형식이 손상됨"]
    );
    return { ...DEFAULTS };
  }

  const { state, repairs, storedVersion } = coerce(parsed);
  if (storedVersion !== null && storedVersion > SCHEMA_VERSION) {
    reportIssue(
      "newer-schema",
      "더 새로운 버전에서 저장된 기록입니다. 읽기만 하고 덮어쓰지 않습니다 — 최신 버전에서 열어 주세요.",
      [`저장된 버전 v${storedVersion}, 현재 버전 v${SCHEMA_VERSION}`]
    );
  } else if (repairs.length > 0) {
    reportIssue(
      "data-repaired",
      "저장된 학습 기록 일부가 손상되어 기본값으로 되돌렸습니다.",
      repairs
    );
  }
  return state;
}

function describeSaveError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      (err.code === 22 || err.code === 1014))
  ) {
    return "저장 공간이 가득 찼습니다";
  }
  return err instanceof Error && err.message ? err.message : "저장소를 사용할 수 없습니다";
}

/**
 * Writes the blob, and says so when it can't.
 *
 * The old version swallowed the error, so a full or disabled localStorage
 * left the UI showing a bookmark the user never actually got to keep.
 * Returns false on failure and records a StorageIssue; callers stay void
 * (the SessionStore interface is unchanged), but the UI can subscribe.
 */
function save(state: PersistedShape): boolean {
  if (!isBrowser()) return false;

  // Never overwrite a blob a newer build wrote — we'd drop the fields we
  // don't know about.
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      const version = (JSON.parse(existing) as { schemaVersion?: unknown }).schemaVersion;
      if (typeof version === "number" && version > SCHEMA_VERSION) {
        reportIssue(
          "newer-schema",
          "더 새로운 버전에서 저장된 기록이 있어 변경 사항을 저장하지 않았습니다. 최신 버전에서 열어 주세요.",
          [`저장된 버전 v${version}, 현재 버전 v${SCHEMA_VERSION}`]
        );
        return false;
      }
    }
  } catch {
    // Unreadable existing blob is not a reason to refuse the write — load()
    // has already reported it and we're about to replace it.
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (currentIssue?.kind === "save-failed") clearStorageIssue();
    return true;
  } catch (err) {
    reportIssue(
      "save-failed",
      "변경 사항을 저장하지 못했습니다. 이 기기에 기록이 남지 않습니다 — 브라우저 저장 공간을 확인하거나 기록을 내보내 두세요.",
      [describeSaveError(err)]
    );
    return false;
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

// ---------------------------------------------------------------------------
// Backup: export / import
//
// Every word saved and article read lives in one localStorage key on one
// device. Clearing site data, a full quota, a new laptop — any of them wipes
// months of learning, and until there's a server to sync to, a file the user
// keeps is the only way out. Deliberately not on the SessionStore interface:
// this is about the storage medium, not about session state, and a Supabase
// store would replace it with a real account rather than implement it.
// ---------------------------------------------------------------------------

/** Envelope written by `exportSessionJson` — versioned so a future import can migrate it. */
export interface SessionExport {
  app: "briefly";
  schemaVersion: number;
  exportedAt: string;
  data: PersistedShape;
}

/** Suggested filename for a downloaded backup, e.g. briefly-backup-2026-08-11.json. */
/**
 * Erases this browser's copy of the reader's record.
 *
 * Only for account deletion. Signing out deliberately leaves local data alone
 * — a shared laptop is not a request to be forgotten — but deleting an account
 * is exactly that request, and leaving the words and reading history sitting
 * in localStorage would answer it with the visible half only.
 */
export function clearLocalSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function sessionExportFilename(now: Date = new Date()): string {
  return `briefly-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** The user's whole local record, as pretty-printed JSON ready to download. */
export function exportSessionJson(): string {
  const payload: SessionExport = {
    app: "briefly",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: load(),
  };
  return JSON.stringify(payload, null, 2);
}

export interface ImportResult {
  ok: boolean;
  /** User-facing, Korean. Present only when ok is false. */
  error?: string;
  /** Fields that arrived malformed and were reset — worth telling the user about. */
  repairs?: string[];
}

/**
 * Restores a backup, replacing what's on this device.
 *
 * Replace rather than merge: a restore should leave the user with exactly the
 * state they backed up, and silently union-ing two histories would produce a
 * record that never existed. Callers should confirm before calling.
 */
export function importSessionJson(json: string): ImportResult {
  if (!isBrowser()) return { ok: false, error: "브라우저에서만 복구할 수 있습니다." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "백업 파일을 읽을 수 없습니다 (JSON 형식이 아닙니다)." };
  }

  // Accepts both the export envelope and a bare state blob, so a file
  // recovered by hand from localStorage still restores.
  const envelope = isRecord(parsed) && isRecord(parsed.data) ? parsed : null;
  const body = envelope ? envelope.data : parsed;
  if (!isRecord(body)) {
    return { ok: false, error: "백업 파일의 형식이 올바르지 않습니다." };
  }

  const declaredVersion =
    envelope && typeof envelope.schemaVersion === "number"
      ? envelope.schemaVersion
      : typeof body.schemaVersion === "number"
        ? body.schemaVersion
        : null;
  if (declaredVersion !== null && declaredVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `더 새로운 버전(v${declaredVersion})에서 만든 백업입니다. 최신 버전에서 복구해 주세요.`,
    };
  }

  const { state, repairs } = coerce(body);
  if (!save(state)) {
    return {
      ok: false,
      error: getStorageIssue()?.message ?? "복구한 기록을 저장하지 못했습니다.",
    };
  }
  return repairs.length > 0 ? { ok: true, repairs } : { ok: true };
}

/** The parts of a reader's record that sync across devices. */
export interface SyncableState {
  level: CefrLevel;
  onboarded: boolean;
  bookmarks: string[];
  readArticles: string[];
  readEvents: ReadEvent[];
  savedWords: SavedWordEntry[];
  savedSentences: SavedSentenceEntry[];
}

/** Read the syncable slice without exposing the whole persisted blob. */
export function readSyncableState(): SyncableState {
  const s = load();
  return {
    level: s.level,
    onboarded: s.onboarded,
    bookmarks: s.bookmarks,
    readArticles: s.readArticles,
    readEvents: s.readEvents,
    savedWords: s.savedWords,
    savedSentences: s.savedSentences,
  };
}

/**
 * Apply an already-merged state in one write.
 *
 * Sync needs this rather than the per-item setters: replaying a merge through
 * toggleSavedWord() and friends would be one localStorage write per item, and
 * a failure partway would leave the device holding half a merge with no way
 * to tell. One read, one write, one notify.
 *
 * Deliberately narrow — it can only set the fields lib/sync/merge.ts produces,
 * so a sync bug cannot reach fontSize, theme, or the storage-issue record.
 * Returns false if the write was refused (quota, newer schema); the caller
 * must not report success in that case.
 *
 * Does NOT notify subscribers: notifySessionChange lives in useSession, which
 * imports this module, and reaching back would make the cycle. The caller —
 * always client-side — notifies.
 */
export function applySyncedState(next: SyncableState): boolean {
  const current = load();
  return save({
    ...current,
    level: next.level,
    onboarded: next.onboarded,
    bookmarks: next.bookmarks,
    readArticles: next.readArticles,
    readEvents: next.readEvents,
    savedWords: next.savedWords,
    savedSentences: next.savedSentences,
  });
}
