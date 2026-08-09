/**
 * Admin console auth — a single shared password gate (production-
 * readiness.md §2 "접근 보호 (운영자 로그인)"). This is intentionally the
 * simplest thing that works for a one-operator console with no Supabase yet:
 * one env password, one signed cookie, no user accounts.
 *
 * *** Replace when Supabase Auth ships (production-readiness.md §3) ***
 * This is NOT real multi-user authentication — there's one shared secret and
 * no per-operator identity/audit trail. Swap for Supabase Auth + an
 * `is_admin` claim (or a dedicated `admins` table) once that's connected;
 * everything that reads `isAdminSession()` below is the integration point.
 *
 * Cookie is a signed `<expiresAtMs>.<hmac>` value (HMAC-SHA256), verified
 * with a timing-safe comparison — not a session id looked up in a store,
 * since there's no DB to store sessions in yet (A1 §"로컬 모드 우선").
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "briefly_admin_session";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw && pw.length > 0 ? pw : null;
}

/**
 * Secret used to sign the session cookie. Falls back to ADMIN_PASSWORD
 * itself when ADMIN_SESSION_SECRET isn't set — fine for local/dev use, but
 * operators deploying this for real should set ADMIN_SESSION_SECRET
 * explicitly (see .env.example) so rotating the login password doesn't
 * also invalidate the signing key mid-way through a design change.
 */
function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || getAdminPassword();
  if (!secret) {
    throw new Error(
      "ADMIN_PASSWORD (or ADMIN_SESSION_SECRET) is not set — admin console cannot start a session."
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/** Checks the submitted password against ADMIN_PASSWORD with a timing-safe comparison. */
export function verifyPassword(candidate: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isAdminConfigured(): boolean {
  return getAdminPassword() !== null;
}

/** Builds a fresh signed cookie value, valid for ADMIN_SESSION_TTL_MS from now. */
export function createSessionToken(): string {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  return `${expiresAt}.${sign(String(expiresAt))}`;
}

/** Verifies a cookie value's signature and expiry. Never throws. */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  let expectedSig: string;
  try {
    expectedSig = sign(expiresAtRaw);
  } catch {
    return false;
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
