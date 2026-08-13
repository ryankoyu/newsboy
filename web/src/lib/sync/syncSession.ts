"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CefrLevel } from "@/lib/types";
import {
  readSyncableState,
  applySyncedState,
  type SavedWordEntry,
  type SyncableState,
} from "@/lib/session";
import {
  mergeSavedWords,
  mergeIds,
  mergeReadEvents,
  resolveLevel,
  partitionStorable,
} from "@/lib/sync/merge";

/**
 * Pull the signed-in reader's record, merge it with this device's, push the
 * union back.
 *
 * Local storage stays the source of truth for what this device shows. The
 * server is a backup that survives a lost phone, not an authority that can
 * overrule what is in front of the reader — so a failed sync leaves the app
 * working exactly as it did, and an empty server never empties a device.
 *
 * Every query below is unqualified by user: the "own row" policies in
 * 0001_schema.sql add that. If this file forgot a filter the database would
 * still refuse, which is the only arrangement worth trusting.
 */

export interface SyncResult {
  ok: boolean;
  /** User-facing Korean, always present — the settings screen shows it verbatim. */
  message: string;
  savedWordCount?: number;
  /**
   * Bookmarks and read marks whose article ids are not database UUIDs, which
   * happens when the reader has been browsing the committed seed. Skipped
   * rather than pushed, because the foreign key would reject them and take
   * the vocabulary sync down with them.
   */
  skippedArticleRefs?: number;
}

interface RemoteWordRow {
  term: string;
  meaning_ko: string | null;
  created_at: string;
}

export async function syncSession(
  db: SupabaseClient,
  userId: string
): Promise<SyncResult> {
  const local = readSyncableState();

  try {
    const [profile, words, bookmarks, progress] = await Promise.all([
      db.from("profiles").select("level").eq("id", userId).maybeSingle(),
      db.from("saved_words").select("term, meaning_ko, created_at"),
      db.from("bookmarks").select("article_id"),
      db.from("reading_progress").select("article_id, read_at"),
    ]);

    const firstError = profile.error ?? words.error ?? bookmarks.error ?? progress.error;
    if (firstError) {
      return { ok: false, message: `동기화하지 못했습니다: ${firstError.message}` };
    }

    const remoteWords: SavedWordEntry[] = ((words.data ?? []) as RemoteWordRow[]).map((w) => ({
      term: w.term,
      meaning_ko: w.meaning_ko,
      savedAt: w.created_at,
    }));
    const remoteBookmarks = ((bookmarks.data ?? []) as { article_id: string }[]).map(
      (b) => b.article_id
    );
    const remoteProgress = ((progress.data ?? []) as { article_id: string; read_at: string }[]).map(
      (p) => ({ articleId: p.article_id, readAt: p.read_at })
    );

    const merged: SyncableState = {
      level: resolveLevel(local, (profile.data?.level as CefrLevel | undefined) ?? null),
      onboarded: local.onboarded,
      savedWords: mergeSavedWords(local.savedWords, remoteWords),
      bookmarks: mergeIds(local.bookmarks, remoteBookmarks),
      readArticles: mergeIds(
        local.readArticles,
        remoteProgress.map((p) => p.articleId)
      ),
      readEvents: mergeReadEvents(local.readEvents, remoteProgress),
      // Sentences reference article_versions(id), which this device does not
      // store — it keeps articleId + level. Resolving that needs a lookup per
      // sentence, so they stay local-only for now and Settings says so rather
      // than letting a reader believe they are backed up.
      savedSentences: local.savedSentences,
    };

    // Write locally BEFORE pushing. If the push fails the reader still gains
    // whatever the server had, and the next sync retries the upload; the
    // reverse order risks a device that uploaded but shows nothing new.
    if (!applySyncedState(merged)) {
      return {
        ok: false,
        message: "동기화한 기록을 이 기기에 저장하지 못했습니다. 저장 공간을 확인해 주세요.",
      };
    }

    const pushError = await push(db, userId, merged);
    if (pushError) {
      return {
        ok: false,
        message:
          `내려받기는 끝났지만 올리는 데 실패했습니다: ${pushError}. ` +
          "이 기기의 기록은 그대로입니다.",
      };
    }

    const { skipped } = partitionStorable([...merged.bookmarks, ...merged.readArticles]);
    return {
      ok: true,
      message: `동기화 완료 — 저장한 단어 ${merged.savedWords.length}개.`,
      savedWordCount: merged.savedWords.length,
      skippedArticleRefs: skipped.length,
    };
  } catch (err) {
    return {
      ok: false,
      message: `동기화 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Returns an error message, or null when everything landed. */
async function push(
  db: SupabaseClient,
  userId: string,
  state: SyncableState
): Promise<string | null> {
  const profile = await db
    .from("profiles")
    .upsert({ id: userId, level: state.level, updated_at: new Date().toISOString() });
  if (profile.error) return profile.error.message;

  if (state.savedWords.length > 0) {
    const words = await db.from("saved_words").upsert(
      state.savedWords.map((w) => ({
        user_id: userId,
        term: w.term,
        meaning_ko: w.meaning_ko,
        // word_id stays null: the term snapshot is what survives an article
        // being replaced, and resolving the id would need a per-word lookup
        // for no gain the reader can see.
      })),
      { onConflict: "user_id,term" }
    );
    if (words.error) return words.error.message;
  }

  const { storable: bookmarkIds } = partitionStorable(state.bookmarks);
  if (bookmarkIds.length > 0) {
    const rows = await db
      .from("bookmarks")
      .upsert(
        bookmarkIds.map((id) => ({ user_id: userId, article_id: id })),
        { onConflict: "user_id,article_id" }
      );
    if (rows.error) return rows.error.message;
  }

  const readByArticle = new Map(state.readEvents.map((e) => [e.articleId, e.readAt]));
  const { storable: readIds } = partitionStorable(state.readArticles);
  if (readIds.length > 0) {
    const rows = await db.from("reading_progress").upsert(
      readIds.map((id) => ({
        user_id: userId,
        article_id: id,
        completed: true,
        // An article read before readEvents existed has no timestamp, and
        // inventing one would put fake days into the streak. The column
        // default (now) is the honest fallback: it records when we learned.
        ...(readByArticle.has(id) ? { read_at: readByArticle.get(id) } : {}),
      })),
      { onConflict: "user_id,article_id" }
    );
    if (rows.error) return rows.error.message;
  }

  return null;
}
