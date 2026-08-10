"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom tab bar (mobile) + side nav (desktop, >=1024px).
 * a3-ui-ux.md §1-4 "탭(레벨 스위처 & 하단 네비)" + §2-1 desktop variant +
 * §4-2 breakpoints. MVP tabs: Home / Saved / Settings.
 *
 * Both variants render; the `.briefly-tabbar` / `.briefly-sidenav` classes
 * in globals.css (media query, §4-2) decide which one is visible per
 * breakpoint. Layout-only concerns (flex direction, spacing, colors) stay
 * inline here — `display` must NOT be set inline, or it would always win
 * over the media query and break the mobile/desktop switch.
 */
const TABS = [
  { href: "/", label: "Home", emoji: "🏠", match: (p: string) => p === "/" },
  { href: "/saved", label: "My", emoji: "🔖", match: (p: string) => p.startsWith("/saved") },
  { href: "/settings", label: "Settings", emoji: "⚙️", match: (p: string) => p.startsWith("/settings") },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="briefly-tabbar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        height: "var(--tabbar-h)",
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "var(--color-bg)",
        boxShadow: "var(--shadow-sticky)",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              textDecoration: "none",
              color: active ? "var(--color-accent)" : "var(--color-text-muted)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-xs)",
            }}
          >
            <span aria-hidden style={{ fontSize: 20 }}>
              {tab.emoji}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="briefly-sidenav"
      style={{
        width: 240,
        flexShrink: 0,
        flexDirection: "column",
        gap: "var(--sp-2)",
        padding: "var(--sp-6) var(--sp-4)",
        borderRight: "1px solid var(--color-border)",
        minHeight: "100vh",
      }}
    >
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: "var(--fs-h3)",
          textDecoration: "none",
          color: "var(--color-text)",
          marginBottom: "var(--sp-6)",
        }}
      >
        <span aria-hidden>☕</span>
        <span>Newsboy</span>
      </Link>
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-3)",
              padding: "var(--sp-3) var(--sp-3)",
              borderRadius: "var(--r-sm)",
              textDecoration: "none",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-ui)",
              fontWeight: active ? 700 : 500,
              color: active ? "var(--color-accent)" : "var(--color-text)",
              background: active ? "var(--color-accent-soft)" : "transparent",
            }}
          >
            <span aria-hidden style={{ fontSize: 18 }}>
              {tab.emoji}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
