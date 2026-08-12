import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  ADMIN_SESSION_TTL_MS,
  clearRevokedSessions,
  createSessionToken,
  isAdminConfigured,
  isSessionSigningConfigured,
  revokeSession,
  sessionIdFromToken,
  verifyPassword,
  verifySessionToken,
} from "./auth";

beforeEach(() => {
  clearRevokedSessions();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isAdminConfigured / verifyPassword", () => {
  it("is not configured when ADMIN_PASSWORD is unset", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(isAdminConfigured()).toBe(false);
    expect(verifyPassword("anything")).toBe(false);
  });

  it("verifies the exact configured password", () => {
    vi.stubEnv("ADMIN_PASSWORD", "correct-horse-battery-staple");
    expect(isAdminConfigured()).toBe(true);
    expect(verifyPassword("correct-horse-battery-staple")).toBe(true);
    expect(verifyPassword("wrong")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });

  it("rejects candidates of every length without throwing (no length short-circuit)", () => {
    vi.stubEnv("ADMIN_PASSWORD", "correct-horse-battery-staple");
    expect(verifyPassword("c")).toBe(false);
    expect(verifyPassword("correct-horse-battery-stapl")).toBe(false);
    expect(verifyPassword("correct-horse-battery-staple-and-then-some")).toBe(false);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  it("a freshly created token verifies as valid", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });

  it("rejects undefined/empty/malformed tokens", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken(null)).toBe(false);
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken("not-a-valid-token")).toBe(false);
    // Old two-part `<expiresAt>.<sig>` cookies no longer verify.
    expect(verifySessionToken(`${Date.now() + 1000}.deadbeef`)).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() - 20 * 60 * 60 * 1000);
    const token = createSessionToken(); // expires 12h after a time 20h ago
    nowSpy.mockRestore();
    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects a token whose expiry is further out than one TTL, even when correctly signed", () => {
    // The shape a forged token takes: real signature, decade-long life. This
    // is the cap that keeps a leaked signing key from minting eternal access.
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    const farFuture = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
    const payload = `${"a".repeat(32)}.${farFuture}`;
    const sig = createHmac("sha256", "signing-secret").update(payload).digest("hex");
    expect(verifySessionToken(`${payload}.${sig}`)).toBe(false);

    // Same construction inside the TTL is accepted, so the rejection above is
    // the expiry cap and not a broken signature.
    const withinTtl = Date.now() + ADMIN_SESSION_TTL_MS - 1000;
    const okPayload = `${"a".repeat(32)}.${withinTtl}`;
    const okSig = createHmac("sha256", "signing-secret").update(okPayload).digest("hex");
    expect(verifySessionToken(`${okPayload}.${okSig}`)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "secret-one");
    const token = createSessionToken();

    vi.stubEnv("ADMIN_SESSION_SECRET", "secret-two");
    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    const token = createSessionToken();
    const [sessionId, expiresAt, signature] = token.split(".");
    expect(verifySessionToken(`${sessionId}.${expiresAt}.${"0".repeat(signature.length)}`)).toBe(
      false
    );
  });

  it("rejects a token whose session id was swapped for another (signature covers the id)", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    const [, expiresAt, signature] = createSessionToken().split(".");
    expect(verifySessionToken(`${"b".repeat(32)}.${expiresAt}.${signature}`)).toBe(false);
  });

  it("gives every session its own id", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    const a = sessionIdFromToken(createSessionToken());
    const b = sessionIdFromToken(createSessionToken());
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe("revokeSession", () => {
  it("kills one session immediately while leaving the others alone", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    const doomed = createSessionToken();
    const survivor = createSessionToken();

    revokeSession(doomed);

    expect(verifySessionToken(doomed)).toBe(false);
    expect(verifySessionToken(survivor)).toBe(true);
  });

  it("ignores malformed input rather than throwing", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "signing-secret");
    expect(() => revokeSession(undefined)).not.toThrow();
    expect(() => revokeSession("garbage")).not.toThrow();
  });
});

describe("session secret resolution", () => {
  it("never signs with ADMIN_PASSWORD itself, even when it is the only thing set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const token = createSessionToken();
    const [sessionId, expiresAt] = token.split(".");
    const signedWithPassword = createHmac("sha256", "pw")
      .update(`${sessionId}.${expiresAt}`)
      .digest("hex");
    expect(token.split(".")[2]).not.toBe(signedWithPassword);
    expect(verifySessionToken(token)).toBe(true);
  });

  it("refuses to issue a session in production when ADMIN_SESSION_SECRET is unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    expect(isSessionSigningConfigured()).toBe(false);
    expect(() => createSessionToken()).toThrow(/ADMIN_SESSION_SECRET/);
    // Verification fails closed rather than propagating the throw.
    expect(verifySessionToken(`${"a".repeat(32)}.${Date.now() + 1000}.abc`)).toBe(false);
  });

  it("throws when neither a secret nor a password is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_SESSION_SECRET", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(() => createSessionToken()).toThrow(/ADMIN_PASSWORD/);
  });
});
