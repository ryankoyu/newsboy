"use client";

import { useState } from "react";
import type { ReadingScale } from "@/lib/session";
import { useSession } from "@/lib/useSession";

const SCALES: ReadingScale[] = ["S", "M", "L", "XL"];

/**
 * "Aa" font size control — a3-ui-ux.md §2-2 point 1, §3-4.
 * Popover with S/M/L/XL. Applies to article body only via --reading-scale.
 */
export function FontSizePopover() {
  const { session, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const current = session.getFontSize();

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="글자 크기 조절"
        aria-expanded={open}
        style={{
          width: 44,
          height: 44,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          fontSize: 16,
          color: "var(--color-text)",
        }}
      >
        Aa
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            role="menu"
            aria-label="글자 크기"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              zIndex: 41,
              marginTop: "var(--sp-2)",
              background: "var(--color-surface)",
              borderRadius: "var(--r-md)",
              boxShadow: "var(--shadow-pop)",
              padding: "var(--sp-2)",
              display: "flex",
              gap: "var(--sp-1)",
            }}
          >
            {SCALES.map((s) => (
              <button
                key={s}
                role="menuitemradio"
                aria-checked={current === s}
                onClick={() => {
                  session.setFontSize(s);
                  refresh();
                  setOpen(false);
                }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--r-sm)",
                  border: "none",
                  fontFamily: "var(--font-ui)",
                  fontWeight: 600,
                  fontSize: 14,
                  background: current === s ? "var(--color-accent-soft)" : "transparent",
                  color: current === s ? "var(--color-accent)" : "var(--color-text)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
