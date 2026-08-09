import { describe, it, expect, vi, afterEach } from "vitest";
import { isEditionPast, formatPastEditionLabel } from "@/lib/editionDate";

afterEach(() => {
  vi.useRealTimers();
});

describe("isEditionPast", () => {
  it("is false when the edition date matches today (local date)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T09:00:00.000Z"));
    expect(isEditionPast("2026-07-17")).toBe(false);
  });

  it("is true when the edition date is before today — docs/feature-status.md G4", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T09:00:00.000Z"));
    expect(isEditionPast("2026-07-13")).toBe(true);
  });
});

describe("formatPastEditionLabel", () => {
  it("formats a YYYY-MM-DD date as a Korean long date", () => {
    expect(formatPastEditionLabel("2026-07-13")).toBe("2026년 7월 13일");
  });
});
