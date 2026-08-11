"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { TabBar, SideNav } from "@/components/AppNav";
import { useNewsprintSkin } from "@/components/newsprint/useNewsprintSkin";

/**
 * Root shell: decides whether to show the global header + tab bar/side nav.
 *
 * a3-ui-ux.md:
 * - Article viewer (§2-2): tab bar hidden ("몰입 독서"), has its own sticky
 *   top bar rendered by the page itself — so AppHeader is also skipped here.
 * - Onboarding (§2-4): full-screen flow, no chrome.
 *
 * The newsprint front page (design_handoff_newsprint_skin §1) sets its own
 * nameplate, section strip and tab bar as part of page one, so home also goes
 * bare while that skin is active. Every other route keeps the standard shell
 * — those screens have not been designed in newsprint yet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const newsprint = useNewsprintSkin();
  const isArticleViewer = pathname.startsWith("/article/");
  const isOnboarding = pathname.startsWith("/onboarding");
  // Newsprint screens draw their own nameplate and tab bar as part of the
  // page, so they go bare. Routes not yet designed in newsprint keep the
  // standard shell.
  const isNewsprintPage = newsprint && (pathname === "/" || pathname.startsWith("/saved") || pathname.startsWith("/settings") ||
      pathname.startsWith("/archive"));
  const bare = isArticleViewer || isOnboarding || isNewsprintPage;

  if (bare) {
    return <>{children}</>;
  }

  return (
    <div className="briefly-shell-desktop">
      <SideNav />
      <div className="briefly-shell-main">
        <AppHeader />
        <div className="briefly-shell-content">{children}</div>
      </div>
      <TabBar />
    </div>
  );
}
