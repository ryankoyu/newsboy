/** Onboarding step indicator — a3-ui-ux.md §2-4. */
export function ProgressDots({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <div
      aria-label={`${step} / ${total} 단계`}
      style={{ display: "flex", gap: "var(--sp-2)", justifyContent: "center" }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: i < step ? "var(--color-accent)" : "var(--color-border-strong)",
          }}
        />
      ))}
    </div>
  );
}
