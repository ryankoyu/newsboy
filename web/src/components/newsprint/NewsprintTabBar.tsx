"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookmarkIcon, GearIcon, HomeIcon } from "@/components/newsprint/icons";

/**
 * Bottom navigation, newsprint skin — design_handoff_newsprint_skin §1,
 * "Tab bar": 2px solid top rule, --paper-tabbar ground, glyph over a
 * Pretendard Korean label, active in --ink and the rest in --ink-faint.
 *
 * The handoff draws five columns; this app has three destinations
 * (Home / My / Settings), and inventing two more to fill the row would put
 * fake navigation in front of readers. So the row is three equal columns
 * with the handoff's treatment — the same tabs the standard skin ships.
 *
 * Glyphs are typographic rather than the emoji the standard TabBar uses:
 * the paper takes no colour and no emoji (handoff, "Boundary").
 */
const TABS = [
  { href: "/", label: "홈", Icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/saved", label: "내 서재", Icon: BookmarkIcon, match: (p: string) => p.startsWith("/saved") },
  { href: "/settings", label: "설정", Icon: GearIcon, match: (p: string) => p.startsWith("/settings") },
];

export function NewsprintTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 430,
          maxWidth: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          borderTop: "2px solid var(--rule-strong)",
          background: "var(--paper-tabbar)",
          padding: "9px 0 14px",
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                textDecoration: "none",
                fontFamily: "var(--font-ui)",
                fontSize: 10.5,
                color: active ? "var(--ink)" : "var(--ink-faint)",
              }}
            >
              <tab.Icon size={17} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
