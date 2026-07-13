import type { Metadata } from "next";
import Link from "next/link";
import { dataProvider } from "@/lib/data";
import { EmptyState } from "@/components/EmptyState";

export const metadata: Metadata = {
  title: "지난 브리핑 · BRIEFLY",
  description: "날짜별로 지난 브리핑 에디션을 둘러보세요.",
};

/**
 * Archive list — enhancement-plan.md Batch 1 #4. Date-browsable list of
 * past editions. The seed currently has a single edition, but the
 * structure supports many (dataProvider.listEditions()) — no special-casing
 * for "only one edition exists".
 */
export default async function ArchivePage() {
  const editions = await dataProvider.listEditions();

  return (
    <main
      style={{
        maxWidth: "var(--content-max)",
        margin: "0 auto",
        padding: "var(--sp-6) var(--sp-4) var(--sp-12)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h1)",
          color: "var(--color-text)",
          margin: "0 0 var(--sp-6)",
        }}
      >
        지난 브리핑
      </h1>

      {editions.length === 0 ? (
        <EmptyState
          emoji="📭"
          title="아직 지난 브리핑이 없어요."
          description="첫 브리핑이 발행되면 여기서 다시 볼 수 있어요."
        />
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-3)",
          }}
        >
          {editions.map((edition) => (
            <li key={edition.id}>
              <Link
                href={`/archive/${edition.edition_date}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  textDecoration: "none",
                  color: "inherit",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--r-md)",
                  boxShadow: "var(--shadow-card)",
                  padding: "var(--sp-4)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--fs-ui)",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  {formatEditionDate(edition.edition_date)}
                </span>
                <span
                  aria-hidden
                  style={{ color: "var(--color-text-muted)", fontSize: "var(--fs-ui)" }}
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function formatEditionDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
