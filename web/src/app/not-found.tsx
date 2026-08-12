import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

/**
 * 404 UI — Next.js `not-found.js` convention
 * (next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md).
 *
 * Reached both by an unmatched URL and by the `notFound()` calls in
 * /article/[slug] and /archive/[date] — a mistyped slug or a date with no
 * edition. Until now those threw the reader onto Next's built-in 404, which
 * has no way back into the app.
 */
export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: "var(--content-max)",
        margin: "0 auto",
        padding: "var(--sp-6) var(--sp-4) var(--sp-12)",
      }}
    >
      <EmptyState
        emoji="📭"
        title="찾는 페이지가 없어요."
        description="주소가 바뀌었거나, 아직 발행되지 않은 브리핑일 수 있어요."
        action={
          <div
            style={{
              display: "flex",
              gap: "var(--sp-4)",
              alignItems: "center",
              marginTop: "var(--sp-2)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-ui)",
            }}
          >
            <Link href="/" style={{ color: "var(--color-accent)" }}>
              오늘의 브리핑
            </Link>
            <Link href="/archive" style={{ color: "var(--color-accent)" }}>
              지난 브리핑
            </Link>
          </div>
        }
      />
    </main>
  );
}
