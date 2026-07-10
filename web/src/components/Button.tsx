import type { ButtonHTMLAttributes } from "react";

/**
 * Primitive button — a3-ui-ux.md §1-4.
 * variants: Primary / Secondary / Ghost / Danger.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_STYLE: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--color-accent)",
    color: "var(--color-text-invert)",
    border: "none",
  },
  secondary: {
    background: "var(--color-surface)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-accent)",
    border: "none",
  },
  danger: {
    background: "transparent",
    color: "var(--color-danger)",
    border: "none",
  },
};

export function Button({
  variant = "primary",
  style,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={className}
      disabled={disabled}
      style={{
        height: 48,
        padding: "0 var(--sp-5)",
        borderRadius: "var(--r-sm)",
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-ui)",
        fontWeight: 600,
        transition: "background var(--dur-fast) var(--ease), opacity var(--dur-fast)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sp-2)",
        minWidth: 44,
        ...VARIANT_STYLE[variant],
        ...style,
      }}
      {...rest}
    />
  );
}
