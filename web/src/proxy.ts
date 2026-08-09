/**
 * Route gate for /admin/** — production-readiness.md §2 "접근 보호".
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` (functionality unchanged
 * — see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * This repo's AGENTS.md flags that convention as a breaking change from
 * older training data, so: this is intentionally `proxy.ts`, not
 * `middleware.ts`.
 *
 * This is an *optimistic* check only (redirect unauthenticated visitors
 * away) — every Server Action under /admin also re-verifies the session
 * itself (see app/admin/actions.ts requireAdminSession), per the Next.js
 * data-security guidance that Proxy is not a substitute for per-action
 * authorization.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
