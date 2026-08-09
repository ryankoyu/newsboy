import { LoginForm } from "./LoginForm";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-6)",
        background: "var(--color-bg)",
        padding: "var(--sp-6)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-h2)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: 0,
          }}
        >
          BRIEFLY 검수 콘솔
        </h1>
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-sm)",
            color: "var(--color-text-muted)",
            margin: "var(--sp-1) 0 0",
          }}
        >
          운영자 전용 — 실인증은 Supabase 도입 시 교체 예정
        </p>
      </div>
      <LoginForm from={from ?? "/admin"} />
    </main>
  );
}
