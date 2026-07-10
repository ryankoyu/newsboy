import type { ReactNode } from "react";

/** Empty / error state block. a3-ui-ux.md §3-4. */
export function EmptyState({
  emoji = "☕",
  title,
  description,
  action,
}: {
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "var(--sp-3)",
        padding: "var(--sp-10) var(--sp-4)",
        color: "var(--color-text-secondary)",
      }}
    >
      <span style={{ fontSize: 32 }} aria-hidden>
        {emoji}
      </span>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          color: "var(--color-text)",
          fontWeight: 600,
          margin: 0,
        }}
      >
        {title}
      </p>
      {description && (
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-sm)",
            color: "var(--color-text-secondary)",
            margin: 0,
            maxWidth: 320,
          }}
        >
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
