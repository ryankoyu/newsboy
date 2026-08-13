"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

/**
 * App-wide error boundary — Next.js `error.js` convention
 * (next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md).
 *
 * Without this file any uncaught render error left the reader on a blank
 * page. It wraps every route below the root layout, so a page that throws —
 * a failed edition lookup, a client component tripping over corrupted
 * session data — degrades to this instead of to nothing.
 *
 * Carries its own link home rather than relying on the shell's nav: the
 * article route renders bare by design, so a failure there would otherwise
 * leave a reader with an error and no way out but the browser's back button.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // No error reporting service is wired up yet; the console is where this
    // is visible today. `digest` is the only handle on a server-side error
    // in production — the message is stripped before it reaches the client.
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        maxWidth: "var(--content-max)",
        margin: "0 auto",
        padding: "var(--sp-6) var(--sp-4) var(--sp-12)",
      }}
    >
      <EmptyState
        emoji="🗞️"
        title="화면을 불러오지 못했어요."
        description="잠시 후 다시 시도해 주세요. 계속 이렇게 나오면 홈으로 돌아가 주세요."
        action={
          <div
            style={{
              display: "flex",
              gap: "var(--sp-3)",
              alignItems: "center",
              marginTop: "var(--sp-2)",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                color: "var(--color-surface)",
                background: "var(--color-accent)",
                border: "none",
                borderRadius: "var(--r-sm)",
                padding: "var(--sp-2) var(--sp-4)",
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            <Link
              href="/"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                color: "var(--color-accent)",
              }}
            >
              홈으로
            </Link>
          </div>
        }
      />
      {error.digest && (
        <p
          style={{
            marginTop: "var(--sp-4)",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-xs)",
            color: "var(--color-text-muted)",
          }}
        >
          {error.digest}
        </p>
      )}
    </main>
  );
}
