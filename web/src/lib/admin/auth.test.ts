import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSessionToken,
  isAdminConfigured,
  verifyPassword,
  verifySessionToken,
} from "./auth";

afterEach(() => {
  vi.unstubAllEnvs();
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
});

describe("createSessionToken / verifySessionToken", () => {
  it("a freshly created token verifies as valid", () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });

  it("rejects undefined/empty/malformed tokens", () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken(null)).toBe(false);
    expect(verifySessionToken("")).toBe(false);
    expect(verifySessionToken("not-a-valid-token")).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    const expiredExpiresAt = Date.now() - 1000;
    // Can't call the private `sign` fn directly, so build via createSessionToken
    // then use a token whose expiry has already passed by construction — we
    // fabricate an expired-but-otherwise-well-formed token using the same
    // token our real implementation would produce for a past expiry by
    // temporarily mocking Date.now.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(expiredExpiresAt - 20 * 60 * 60 * 1000);
    const token = createSessionToken(); // expires 12h after the mocked past time, i.e. still in the past
    nowSpy.mockRestore();
    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects a token signed with a different password/secret", () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw-one");
    const token = createSessionToken();

    vi.stubEnv("ADMIN_PASSWORD", "pw-two");
    expect(verifySessionToken(token)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    const token = createSessionToken();
    const [expiresAt, signature] = token.split(".");
    const tamperedSignature = "0".repeat(signature.length);
    const tampered = `${expiresAt}.${tamperedSignature}`;
    expect(verifySessionToken(tampered)).toBe(false);
  });
});
