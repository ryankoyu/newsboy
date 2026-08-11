"use client";

import { useSyncExternalStore } from "react";
import { useSession } from "@/lib/useSession";

/**
 * Is the newsprint skin active?
 *
 * The skin is light-only by design — the handoff has no dark variant and
 * explicitly forbids inverting the paper — so dark mode falls back to the
 * standard Newsboy skin, which is the fallback the handoff itself proposes
 * ("Boundary: Light theme only").
 *
 * Returns true during SSR and the hydration render: the server cannot see
 * localStorage or prefers-color-scheme, so it always emits newsprint markup
 * and dark-mode readers get one swap after hydration. That keeps the server
 * and client HTML identical, which a theme-dependent first render would not.
 */
export function useNewsprintSkin(): boolean {
  const { session, hydrated } = useSession();
  const theme = session.getTheme();
  const systemDark = useSyncExternalStore(subscribe, read, readOnServer);
  const isDark = hydrated && (theme === "dark" || (theme === "system" && systemDark));
  return !isDark;
}

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia?.(QUERY);
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const read = () => window.matchMedia?.(QUERY).matches ?? false;
/** The server has no colour-scheme preference — assume light, i.e. newsprint. */
const readOnServer = () => false;
