import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * AppHeader — logo + theme toggle + settings. a3-ui-ux.md §2-1 header spec.
 * Sticky, 56px, bottom border. Used on Home; article viewer has its own bar.
 */
export function AppHeader() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        height: "var(--header-h)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--sp-4)",
        background: "var(--color-bg)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--sp-2)",
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: "var(--fs-h3)",
          color: "var(--color-text)",
          textDecoration: "none",
        }}
      >
        <span aria-hidden>☕</span>
        <span>BRIEFLY</span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
        <ThemeToggle />
        <Link
          href="/settings"
          aria-label="설정"
          style={{
            width: 44,
            height: 44,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "var(--r-sm)",
            fontSize: 18,
            textDecoration: "none",
          }}
        >
          <span aria-hidden>⚙️</span>
        </Link>
      </div>
    </header>
  );
}
