"use client";

/**
 * Generic segmented control primitive — a3-ui-ux.md §1-4 "탭(레벨 스위처 & 하단 네비)".
 * Used by LevelSwitcher. role="tablist" per §4-1 accessibility spec.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Optional per-option foreground color when selected (level colors). */
  activeColor?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        background: "var(--color-surface-alt)",
        borderRadius: "var(--r-pill)",
        padding: 4,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              border: "none",
              borderRadius: "var(--r-pill)",
              padding: "var(--sp-2) var(--sp-3)",
              minHeight: 40,
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-ui)",
              fontWeight: 600,
              background: selected ? "var(--color-surface)" : "transparent",
              color: selected
                ? opt.activeColor ?? "var(--color-text)"
                : "var(--color-text-muted)",
              boxShadow: selected ? "var(--shadow-card)" : "none",
              transition:
                "background var(--dur-base) var(--ease), color var(--dur-base) var(--ease), box-shadow var(--dur-base) var(--ease)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
