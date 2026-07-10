"use client";

import { useRouter } from "next/navigation";
import { FontSizePopover } from "@/components/FontSizePopover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSession } from "@/lib/useSession";

/**
 * Article viewer top bar — a3-ui-ux.md §2-2 point 1.
 * ← back / 🔖 save (toggle, fills + accent color when saved) / Aa / theme.
 */
export function ArticleViewerBar({ articleId }: { articleId: string }) {
  const router = useRouter();
  const { session, refresh } = useSession();
  const saved = session.isBookmarked(articleId);

  return (
    <div
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
      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="뒤로"
        style={{
          width: 44,
          height: 44,
          background: "transparent",
          border: "none",
          fontSize: 20,
          color: "var(--color-text)",
        }}
      >
        <span aria-hidden>←</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-1)" }}>
        <button
          type="button"
          onClick={() => {
            session.toggleBookmark(articleId);
            refresh();
          }}
          aria-pressed={saved}
          aria-label={saved ? "저장 취소" : "저장"}
          style={{
            width: 44,
            height: 44,
            background: "transparent",
            border: "none",
            fontSize: 18,
            color: saved ? "var(--color-accent)" : "var(--color-text)",
          }}
        >
          <span aria-hidden>🔖</span>
        </button>
        <FontSizePopover />
        <ThemeToggle />
      </div>
    </div>
  );
}
