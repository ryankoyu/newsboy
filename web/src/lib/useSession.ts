"use client";

/**
 * React glue around sessionStore (src/lib/session.ts), built on
 * useSyncExternalStore so that:
 *
 * 1. Server render + hydration render both see DEFAULT session values
 *    (a no-op fallback store) — no hydration mismatch, no setState-in-effect.
 * 2. Immediately after hydration React re-renders with the real
 *    localStorage-backed store (server snapshot differs from client
 *    snapshot, which useSyncExternalStore resolves automatically).
 * 3. Any mutation calls refresh() -> notifies ALL subscribed components,
 *    so e.g. a bookmark toggled in the viewer updates the Saved tab.
 */

import { useSyncExternalStore } from "react";
import { sessionStore, type SessionStore } from "@/lib/session";

let version = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): number {
  return version;
}

// Distinct from any client snapshot -> forces one re-render after hydration,
// flipping components from the fallback store to the real store.
function getServerSnapshot(): number {
  return -1;
}

export function notifySessionChange(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** Default-only, no-op store used during SSR + hydration render. */
const fallbackStore: SessionStore = {
  getLevel: () => "A2",
  setLevel: () => {},
  getFontSize: () => "M",
  setFontSize: () => {},
  getTheme: () => "system",
  setTheme: () => {},
  hasOnboarded: () => false,
  setOnboarded: () => {},
  hasDismissedOnboardingBanner: () => false,
  dismissOnboardingBanner: () => {},
  getBookmarks: () => [],
  isBookmarked: () => false,
  toggleBookmark: () => false,
  getReadArticles: () => [],
  isRead: () => false,
  markRead: () => {},
  getSeenWords: () => [],
  isWordSeen: () => false,
  markWordSeen: () => {},
  getSavedWords: () => [],
  isWordSaved: () => false,
  toggleSavedWord: () => false,
  getSavedSentences: () => [],
  isSentenceSaved: () => false,
  toggleSavedSentence: () => false,
  getDisplayName: () => null,
  setDisplayName: () => {},
};

export function useSession(): {
  session: SessionStore;
  refresh: () => void;
  /** false during SSR/hydration render; true once real client state is live. */
  hydrated: boolean;
} {
  const v = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = v >= 0;
  return {
    session: hydrated ? sessionStore : fallbackStore,
    refresh: notifySessionChange,
    hydrated,
  };
}
