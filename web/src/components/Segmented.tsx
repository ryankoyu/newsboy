"use client";

import { useRef } from "react";

/**
 * Generic segmented control primitive — a3-ui-ux.md §1-4 "탭(레벨 스위처 & 하단 네비)".
 * Used by LevelSwitcher. role="tablist" per §4-1 accessibility spec.
 *
 * The tabs carry a roving tabindex — only the selected one is in the tab
 * order — which is only half the pattern: without arrow keys, Tab lands on
 * the selection and there is no way to reach the other options at all. This
 * is the app's level switcher and its type-size control, so a keyboard user
 * losing them loses the two settings the product is built around. Arrow /
 * Home / End move the selection and take focus with it, the automatic-
 * activation tablist behaviour (WAI-ARIA APG).
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
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);

  /** Select the option at `index` and move focus onto it. */
  function selectAt(index: number) {
    const opt = options[index];
    if (!opt) return;
    onChange(opt.value);
    tabsRef.current[index]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    // Both axes are handled: the control is horizontal, but a screen-reader
    // user who has been taught "arrows move within a tablist" should not
    // have to know which way this one is laid out.
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        selectAt((index + 1) % options.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        selectAt((index - 1 + options.length) % options.length);
        break;
      case "Home":
        e.preventDefault();
        selectAt(0);
        break;
      case "End":
        e.preventDefault();
        selectAt(options.length - 1);
        break;
    }
  }

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
      {options.map((opt, index) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              tabsRef.current[index] = el;
            }}
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
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
