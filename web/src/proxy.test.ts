import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";
import { ADMIN_SESSION_COOKIE, createSessionToken } from "@/lib/admin/auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

function makeRequest(pathname: string, cookieValue?: string): NextRequest {
  const headers = new Headers();
  if (cookieValue) headers.set("cookie", `${ADMIN_SESSION_COOKIE}=${cookieValue}`);
  return new NextRequest(new URL(pathname, "http://localhost:3000"), { headers });
}

describe("proxy (admin route gate)", () => {
  it("matcher covers /admin and every /admin/* subpath", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*"]);
  });

  it("lets /admin/login through with no session cookie at all", () => {
    const res = proxy(makeRequest("/admin/login"));
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects /admin to /admin/login when there is no session cookie", () => {
    const res = proxy(makeRequest("/admin"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/admin/login");
    expect(location).toContain("from=%2Fadmin");
  });

  it("redirects /admin/2026-07-13 to /admin/login with an invalid cookie", () => {
    const res = proxy(makeRequest("/admin/2026-07-13", "garbage-not-a-real-token"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });

  it("passes through /admin with a valid session cookie", () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    const token = createSessionToken();
    const res = proxy(makeRequest("/admin", token));
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("still redirects an expired session cookie", () => {
    vi.stubEnv("ADMIN_PASSWORD", "pw");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() - 20 * 60 * 60 * 1000);
    const expiredToken = createSessionToken();
    nowSpy.mockRestore();

    const res = proxy(makeRequest("/admin", expiredToken));
    expect(res.status).toBe(307);
  });
});
