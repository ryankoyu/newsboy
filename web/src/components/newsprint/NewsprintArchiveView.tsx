"use client";

import Link from "next/link";
import type { Edition } from "@/lib/types";
import { NewsprintTabBar } from "@/components/newsprint/NewsprintTabBar";
import { FolioLine, Nameplate, formatFolioDate } from "@/components/newsprint/chrome";

/**
 * Back numbers — the newsprint treatment of /archive.
 *
 * Not designed in the handoff ("Known gaps"), but the front page's archive
 * control leads straight here, so it is built from the same vocabulary:
 * a folio bar, uppercase year heads, and ruled rows. A newspaper's own name
 * for its past issues is "back numbers", which is what the page is.
 */

const DISPLAY = "var(--font-display), Georgia, serif";

export function NewsprintArchiveView({ editions }: { editions: Edition[] }) {
  const byYear = new Map<string, Edition[]>();
  for (const e of editions) {
    const year = e.edition_date.slice(0, 4);
    (byYear.get(year) ?? byYear.set(year, []).get(year)!).push(e);
  }
  const years = [...byYear.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <div style={{ display: "flex", justifyContent: "center", background: "var(--paper-desk)" }}>
      <div
        className="np-paper"
        style={{
          width: 430,
          maxWidth: "100%",
          minHeight: "100vh",
          padding: "0 16px 96px",
          position: "relative",
        }}
      >
        <header style={{ textAlign: "center", padding: "18px 2px 10px" }}>
          <div style={{ display: "inline-block" }}>
            <Nameplate size={24} />
          </div>
        </header>

        <div style={{ borderBottom: "3px double var(--rule-strong)", paddingBottom: 6 }}>
          <FolioLine
            dateLabel="Back Numbers"
            right={`${editions.length} ${editions.length === 1 ? "Issue" : "Issues"}`}
            bordered
          />
        </div>

        {editions.length === 0 ? (
          <p
            style={{
              margin: "40px 0",
              textAlign: "center",
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              lineHeight: 1.7,
              color: "var(--ink-muted)",
            }}
          >
            아직 지난 브리핑이 없어요.
            <br />첫 브리핑이 발행되면 여기서 다시 볼 수 있어요.
          </p>
        ) : (
          years.map(([year, list]) => (
            <section key={year}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 2px" }}>
                <span
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 800,
                    fontStretch: "74%",
                    fontSize: 13,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--ink)",
                  }}
                >
                  {year}
                </span>
                <span style={{ flex: 1, height: 1, background: "var(--rule-hair)" }} />
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--ink-faint)" }}>
                  {list.length}
                </span>
              </div>

              {list.map((edition, i) => (
                <Link
                  key={edition.id}
                  href={`/archive/${edition.edition_date}`}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "13px 0",
                    borderBottom: i === list.length - 1 ? undefined : "1px solid var(--rule-hair)",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: DISPLAY,
                      fontWeight: 700,
                      fontStretch: "80%",
                      fontSize: 17,
                      color: "var(--ink-strong)",
                    }}
                  >
                    {formatFolioDate(edition.edition_date).replace(/\.$/, "")}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 11.5,
                      color: "var(--action)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    보기 →
                  </span>
                </Link>
              ))}
            </section>
          ))
        )}
      </div>

      <NewsprintTabBar />
    </div>
  );
}
