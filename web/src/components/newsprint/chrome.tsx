"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Newsprint chrome — the small typographic parts every newspaper page is
 * assembled from. design_handoff_newsprint_skin/README.md, "Design Tokens".
 *
 * These are paper elements, so they follow the paper's rules absolutely:
 * radius 0, no shadow, no colour. The single signal colour (--action) is
 * reserved for app affordances and never appears in typesetting.
 */

const DISPLAY = "var(--font-display), Georgia, serif";


/** The masthead. Blackletter, and used NOWHERE else in the system. */
export function Nameplate({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-nameplate), serif",
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "0.005em",
        color: "var(--ink-strong)",
      }}
    >
      {/* The trailing period is part of the mark. */}
      Newsboy.
    </div>
  );
}

/**
 * The folio line — publication date left, price right, hairlines above and
 * below. The handoff's prototypes carry a fixed 1902 dateline; here it takes
 * the edition's real date so the page is not frozen in time. "One Cent." is
 * kept as costume.
 */
export function FolioLine({
  dateLabel,
  right = "One Cent.",
  bordered = true,
}: {
  dateLabel: string;
  right?: string;
  bordered?: boolean;
}) {
  const cell: CSSProperties = {
    fontFamily: DISPLAY,
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: "0.13em",
    textTransform: "uppercase",
  };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        borderTop: bordered ? "1px solid var(--rule-mid)" : undefined,
        borderBottom: "1px solid var(--rule-mid)",
        padding: "5px 2px",
        color: "var(--ink)",
      }}
    >
      <span style={cell}>{dateLabel}</span>
      <span style={cell}>{right}</span>
    </div>
  );
}

/** Hairlines flanking ◆◆◆ — only between a headline and its deck, or
 *  between sideheads (handoff, "Rules & Ornaments"). */
export function Ornament({ margin = "18px 0 0" }: { margin?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin }}>
      <div style={{ flex: 1, height: 1, background: "var(--rule-mid)" }} />
      <div style={{ fontSize: 8, letterSpacing: "0.45em", color: "var(--rule-mid)" }}>◆◆◆</div>
      <div style={{ flex: 1, height: 1, background: "var(--rule-mid)" }} />
    </div>
  );
}

/** A plain short rule between stacked blocks. */
export function Hairline({ margin = "14px 0 12px" }: { margin?: string }) {
  return <div style={{ margin, height: 1, background: "var(--rule-mid)" }} />;
}

/**
 * Where a cut for a given article lives.
 *
 * Keyed on the article id rather than the slug or the rank: ids are derived
 * from the PIPELINE rank and stay stable when the desk reorders the front
 * page or re-publishes, while a slug moves with the headline and a display
 * rank moves with the desk's decisions.
 *
 * Drop a file at this path and it appears; leave it out and the slot falls
 * back to its labelled placeholder. No data-model change and no upload step —
 * which also means nothing validates that the image matches the story, so
 * this is a staging arrangement, not the finished pipeline.
 */
export function cutPath(articleId: string): string {
  return `/newsprint/cuts/${articleId}.png`;
}

/**
 * An engraving slot.
 *
 * Renders the article's cut when one has been placed, and the labelled
 * placeholder when it has not. Real images must be black-and-white engraving
 * tone inside the 1px rule — the paper takes no colour photography.
 */
export function Cut({
  height = 220,
  label,
  caption,
  articleId,
}: {
  height?: number;
  label: string;
  caption?: string;
  /** When set, look for this article's cut before falling back to the label. */
  articleId?: string;
}) {
  const [missing, setMissing] = useState(false);
  const src = articleId && !missing ? cutPath(articleId) : null;

  return (
    <figure style={{ margin: "14px 0 0" }}>
      <div className="np-cut">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- the cut is a
          // fixed-width block inside a ruled frame; next/image's wrapper adds
          // layout the newsprint rules do not allow.
          <img
            src={src}
            alt=""
            onError={() => setMissing(true)}
            style={{
              display: "block",
              width: "100%",
              height,
              objectFit: "cover",
              border: "1px solid rgba(70,60,44,0.4)",
              filter: "grayscale(1) contrast(1.15)",
            }}
          />
        ) : (
          <div
            style={{
              height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(70,60,44,0.4)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                lineHeight: 1.8,
                textAlign: "center",
                color: "#5c5443",
              }}
            >
              {label}
            </span>
          </div>
        )}
      </div>
      {caption && (
        <figcaption
          style={{
            textAlign: "center",
            fontFamily: DISPLAY,
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--ink-soft)",
            margin: "6px 0 0",
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/** A bordered block with an uppercase centred head — Sources, ad boxes, etc. */
export function RuledBox({
  head,
  children,
  margin = "16px 0 0",
}: {
  head: string;
  children: ReactNode;
  margin?: string;
}) {
  return (
    <section style={{ margin, border: "1px solid var(--rule-mid)", padding: "12px 14px" }}>
      <h2
        style={{
          margin: 0,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontStretch: "74%",
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          textAlign: "center",
          borderBottom: "1px solid var(--rule-mid)",
          paddingBottom: 6,
          color: "var(--ink)",
        }}
      >
        {head}
      </h2>
      <div style={{ marginTop: 9 }}>{children}</div>
    </section>
  );
}

/**
 * Format an edition date the way a folio line sets it:
 * "Monday, August 11, 2026." — parsed as a plain calendar date so a
 * YYYY-MM-DD string never shifts a day across time zones.
 */
export function formatFolioDate(editionDate: string): string {
  const [y, m, d] = editionDate.split("-").map(Number);
  if (!y || !m || !d) return editionDate;
  return `${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })}.`;
}
