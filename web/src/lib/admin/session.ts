/**
 * next/headers-backed helpers for reading/writing the admin session cookie
 * from Server Components / Server Actions. Kept separate from auth.ts so
 * the signing/verification logic itself (auth.ts) stays framework-free and
 * unit-testable without a Next.js request context.
 *
 * Not marked with the `server-only` package (not a project dependency) —
 * relies instead on `next/headers` itself throwing if imported from a
 * Client Component, which has the same practical effect.
 */
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createSessionToken,
  revokeSession,
  verifySessionToken,
} from "./auth";

export async function isAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
}

/** Server Action helper: throws if called without a valid admin session (data-security guidance — Proxy alone isn't authorization). */
export async function requireAdminSession(): Promise<void> {
  if (!(await isAdminSession())) {
    throw new Error("관리자 세션이 없습니다. 다시 로그인해 주세요.");
  }
}

export async function setAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  // Revoke before deleting: dropping the cookie only stops *this* browser
  // from sending it, while the token itself stays valid until its expiry.
  revokeSession(store.get(ADMIN_SESSION_COOKIE)?.value);
  store.delete(ADMIN_SESSION_COOKIE);
}
