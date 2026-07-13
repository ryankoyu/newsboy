import Link from "next/link";
import type { Source } from "@/lib/types";

/**
 * Sources section — a3-ui-ux.md §2-2 point 7. Required in MVP (copyright/
 * trust foundation, r2 lesson: multi-source disclosure). Deep-teal links,
 * external icon, target=_blank rel=noopener.
 *
 * enhancement-plan.md Batch 1 #1 (신뢰 전면화): a trust notice sits ABOVE
 * the source list, stating only what the pipeline actually does —
 * cross-checked across N outlets, rewritten from scratch (see
 * docs/news-sourcing-strategy.md §2-3). No superlatives, no claims we can't
 * back with the seed data's own source_count.
 */
export function SourcesSection({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  const n = sources.length;

  return (
    <section
      className="briefly-sources"
      style={{
        background: "var(--color-surface-alt)",
        borderRadius: "var(--r-md)",
        padding: "var(--sp-4)",
        marginTop: "var(--sp-6)",
      }}
      aria-label="Sources"
    >
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-sm)",
          color: "var(--color-text-secondary)",
          margin: "0 0 var(--sp-4)",
          paddingBottom: "var(--sp-3)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        이 기사는 {n}개 매체에서 교차 확인된 사실을 바탕으로 새로 작성되었습니다.{" "}
        <Link
          href="/about"
          style={{ color: "var(--color-link)", textDecoration: "none" }}
        >
          우리가 뉴스를 만드는 방법 →
        </Link>
      </p>

      <h2
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h3)",
          fontWeight: 600,
          margin: "0 0 var(--sp-3)",
          color: "var(--color-text)",
        }}
      >
        🔗 Sources
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-sm)",
          color: "var(--color-text-secondary)",
          margin: "0 0 var(--sp-2)",
        }}
      >
        This story is based on:
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {sources.map((s) => (
          <li key={s.id} style={{ margin: "var(--sp-1) 0" }}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-sm)",
                color: "var(--color-link)",
                textDecoration: "none",
              }}
            >
              {s.outlet ?? new URL(s.url).hostname} <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-sm)",
          color: "var(--color-text-muted)",
          margin: "var(--sp-3) 0 0",
        }}
      >
        · 여러 출처의 사실을 확인해 새로 작성했습니다.
      </p>
    </section>
  );
}
