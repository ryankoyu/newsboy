"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { TabBar, SideNav } from "@/components/AppNav";

/**
 * Root shell: decides whether to show the global header + tab bar/side nav.
 *
 * a3-ui-ux.md:
 * - Article viewer (§2-2): tab bar hidden ("몰입 독서"), has its own sticky
 *   top bar rendered by the page itself — so AppHeader is also skipped here.
 * - Onboarding (§2-4): full-screen flow, no chrome.
 *
 * Every other route keeps the shell. It used to also go bare on home, saved,
 * settings and archive while the newsprint skin was on, because those pages
 * drew their own nameplate and tab bar — which is why a past edition had
 * neither: the route was treated as newsprint, but the page rendered the
 * standard view, so the chrome was dropped by one side and never drawn by
 * the other. With the skin gone, the rule is simply: reading and onboarding
 * are bare, everything else is framed.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isArticleViewer = pathname.startsWith("/article/");
  const isOnboarding = pathname.startsWith("/onboarding");
  const bare = isArticleViewer || isOnboarding;

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
