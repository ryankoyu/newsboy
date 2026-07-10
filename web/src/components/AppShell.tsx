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
