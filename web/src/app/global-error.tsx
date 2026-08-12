"use client"; // Error boundaries must be Client Components

/**
 * Last resort — Next.js `global-error.js` convention
 * (next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md,
 * "Global errors").
 *
 * `error.tsx` sits *below* the root layout and so cannot catch a failure in
 * the layout itself (fonts, AppShell, the theme script). That case is the one
 * that ends in a truly blank document, which is why it gets its own boundary.
 *
 * This component replaces the root layout while it is active, so it must
 * supply its own <html>/<body> — and it cannot count on globals.css or the
 * font variables being loaded. Hence literal values instead of design tokens:
 * this screen has to render even when the stylesheet is the thing that broke.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF9F6",
          color: "#2B2823",
          fontFamily: "'Pretendard', system-ui, sans-serif",
        }}
      >
        <main style={{ textAlign: "center", padding: 24, maxWidth: 360 }}>
          <p style={{ fontSize: 32, margin: "0 0 12px" }} aria-hidden>
            🗞️
          </p>
          <h1 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 8px" }}>
            앱을 여는 중에 문제가 생겼어요.
          </h1>
          <p style={{ fontSize: 13, color: "#5C574F", margin: "0 0 20px", lineHeight: 1.6 }}>
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              fontSize: 15,
              color: "#FFFFFF",
              background: "#C8622D",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11, color: "#8B857A" }}>{error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
