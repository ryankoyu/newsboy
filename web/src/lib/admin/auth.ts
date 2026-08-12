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
 * Cookie is a signed `<sessionId>.<expiresAtMs>.<hmac>` value (HMAC-SHA256),
 * verified with a timing-safe comparison — not a session id looked up in a
 * DB, since there's no DB to store sessions in yet (A1 §"로컬 모드 우선").
 * The session id exists so one session can be killed on its own (see
 * `revokeSession`); the process-local revocation list is the honest limit of
 * what's possible without that DB.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "briefly_admin_session";
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

/** Tolerance for a client/server clock disagreeing when we cap a token's expiry. */
const CLOCK_SKEW_MS = 60 * 1000;

function getAdminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  return pw && pw.length > 0 ? pw : null;
}

/** Warn about a missing ADMIN_SESSION_SECRET once per process, not once per request. */
let warnedAboutDerivedSecret = false;

/**
 * Secret used to sign the session cookie.
 *
 * ADMIN_SESSION_SECRET is the only supported answer. When it's missing we
 * used to sign with ADMIN_PASSWORD itself, which handed the login password
 * double duty as the signing key: anyone who knew it could mint a cookie
 * with any expiry they liked — a password good for one 12h login became a
 * forged token good for a decade. So:
 *
 * - production: refuse to start a session at all (fail closed).
 * - dev: derive a key from the password through a domain-separated HMAC and
 *   warn loudly. The derivation is public, so this is NOT a substitute for a
 *   real secret — it only stops the raw password from being the key material.
 *   What actually caps the damage is `verifySessionToken` refusing any expiry
 *   further out than one TTL, so a forged token is worth no more than a real
 *   login. Deterministic on purpose: a random per-process key would break
 *   dev the moment Next.js served a request from a second worker.
 */
function getSessionSecret(): string {
  const explicit = process.env.ADMIN_SESSION_SECRET;
  if (explicit && explicit.length > 0) return explicit;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "ADMIN_SESSION_SECRET is not set — refusing to sign admin sessions with ADMIN_PASSWORD. Set ADMIN_SESSION_SECRET (see web/.env.example) and redeploy."
    );
  }

  const password = getAdminPassword();
  if (!password) {
    throw new Error(
      "ADMIN_PASSWORD (or ADMIN_SESSION_SECRET) is not set — admin console cannot start a session."
    );
  }
  if (!warnedAboutDerivedSecret) {
    warnedAboutDerivedSecret = true;
    console.warn(
      "[admin auth] ADMIN_SESSION_SECRET is not set. Falling back to a key derived from ADMIN_PASSWORD — dev only. Set ADMIN_SESSION_SECRET in web/.env.local before deploying."
    );
  }
  return createHmac("sha256", password)
    .update("briefly:admin-session-signing-key:v1")
    .digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

/**
 * Compares two secrets in constant time regardless of length.
 *
 * timingSafeEqual throws on a length mismatch, and returning early on that
 * check leaks the expected length through response timing. Hashing both
 * sides first gives two 32-byte digests, so every comparison does the same
 * amount of work whatever the inputs were.
 */
function secretsMatch(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Checks the submitted password against ADMIN_PASSWORD with a timing-safe comparison. */
export function verifyPassword(candidate: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false;
  return secretsMatch(candidate, expected);
}

export function isAdminConfigured(): boolean {
  return getAdminPassword() !== null;
}

/**
 * Whether a session can actually be signed in this environment.
 *
 * The login form asks before accepting a password, so a production deploy
 * missing ADMIN_SESSION_SECRET says what's wrong instead of failing closed
 * with a 500 the operator can't read.
 */
export function isSessionSigningConfigured(): boolean {
  try {
    getSessionSecret();
    return true;
  } catch {
    return false;
  }
}

/**
 * Sessions killed before their natural expiry, kept as sessionId -> expiry so
 * entries can be dropped once the token would have expired anyway.
 *
 * Process-local, because there is no store to put it in yet: a server restart
 * forgets the list, and a second instance never learns of it. That's enough
 * for the one-operator local console this is built for (logout revokes the
 * cookie it just cleared), and it's the first thing to move into Supabase
 * along with the rest of this file.
 */
const revokedSessions = new Map<string, number>();

function pruneRevoked(now: number): void {
  for (const [id, expiresAt] of revokedSessions) {
    if (expiresAt <= now) revokedSessions.delete(id);
  }
}

/** Builds a fresh signed cookie value, valid for ADMIN_SESSION_TTL_MS from now. */
export function createSessionToken(): string {
  const sessionId = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  const payload = `${sessionId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

/** The session id inside a token, without verifying it. Null if the token is malformed. */
export function sessionIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [sessionId, expiresAtRaw, signature] = token.split(".");
  if (!sessionId || !expiresAtRaw || !signature) return null;
  return sessionId;
}

/** Kills one session immediately — used on logout, and available if a cookie leaks. */
export function revokeSession(token: string | undefined | null): void {
  const sessionId = sessionIdFromToken(token);
  if (!sessionId) return;
  const now = Date.now();
  pruneRevoked(now);
  revokedSessions.set(sessionId, now + ADMIN_SESSION_TTL_MS + CLOCK_SKEW_MS);
}

/** Test/reset hook — clears the process-local revocation list. */
export function clearRevokedSessions(): void {
  revokedSessions.clear();
}

/** Verifies a cookie value's signature, expiry and revocation state. Never throws. */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [sessionId, expiresAtRaw, signature] = parts;
  if (!sessionId || !expiresAtRaw || !signature) return false;

  const now = Date.now();
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  // An honestly-issued token never expires more than one TTL from now, so a
  // token claiming to — the shape a forged one takes — is rejected on sight,
  // whatever its signature says.
  if (expiresAt > now + ADMIN_SESSION_TTL_MS + CLOCK_SKEW_MS) return false;

  pruneRevoked(now);
  if (revokedSessions.has(sessionId)) return false;

  let expectedSig: string;
  try {
    expectedSig = sign(`${sessionId}.${expiresAt}`);
  } catch {
    return false;
  }
  return secretsMatch(signature, expectedSig);
}
