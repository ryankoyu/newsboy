"use client";

import { useSyncExternalStore } from "react";

/**
 * Is the viewport at the broadsheet breakpoint?
 *
 * design_handoff_newsprint_skin, "Responsive": the mobile templates are a
 * fixed 430px column that simply centres on wider screens until 1024px, where
 * the broadsheet layout takes over. The broadsheet is not fluid — it is a
 * fixed 1160px sheet on a dark desk.
 *
 * Returns false on the server so SSR and the hydration render both emit the
 * mobile column; desktop swaps once after hydration. The alternative — a
 * width-dependent first render — cannot match, because the server has no
 * viewport.
 */
export function useDesktop(): boolean {
  return useSyncExternalStore(subscribe, read, readOnServer);
}

const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia?.(QUERY);
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const read = () => window.matchMedia?.(QUERY).matches ?? false;
const readOnServer = () => false;
