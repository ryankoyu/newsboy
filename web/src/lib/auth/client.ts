"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser's Supabase client — auth only.
 *
 * Separate from the reader's data provider on purpose. That one runs on the
 * server, holds no session and reads published rows; this one lives in the
 * browser, persists a session, and every query it makes is filtered by the
 * "own row" policies in 0001_schema.sql. A reader can only ever reach their
 * own saved words because the database says so, not because this file
 * remembers to add a `where user_id = ...`.
 *
 * Anon key only. The service role key bypasses row-level security entirely
 * and must never be shipped to a browser.
 */

let client: SupabaseClient | null = null;

export function getAuthClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Not configured is a normal state, not an error: the app is designed to
  // work with no environment at all, reading the committed seed. Sign-in is
  // simply absent there.
  if (!url || !anonKey) return null;

  client ??= createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
