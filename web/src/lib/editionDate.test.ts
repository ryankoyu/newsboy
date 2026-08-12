import { describe, it, expect, vi, afterEach } from "vitest";
import { isEditionPast, formatPastEditionLabel } from "@/lib/editionDate";

afterEach(() => {
  vi.useRealTimers();
});

describe("isEditionPast", () => {
  it("is false when the edition date matches today (KST)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T09:00:00.000Z")); // 18:00 KST 07-17
    expect(isEditionPast("2026-07-17")).toBe(false);
  });

  it("is true when the edition date is before today — docs/feature-status.md G4", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T09:00:00.000Z"));
    expect(isEditionPast("2026-07-13")).toBe(true);
  });

  // The morning window the app itself promises the brief in. UTC is still on
  // the previous date here, which used to label the fresh edition "지난 브리핑"
  // every day from midnight until 09:00 KST.
  it("is false at 08:00 KST, when UTC is still on yesterday's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T23:00:00.000Z")); // 08:00 KST 07-17
    expect(isEditionPast("2026-07-17")).toBe(false);
  });

  it("is false at 00:30 KST, the first minutes of the Korean day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T15:30:00.000Z")); // 00:30 KST 07-17
    expect(isEditionPast("2026-07-17")).toBe(false);
  });

  it("turns yesterday's edition past the moment the Korean day rolls over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T14:59:00.000Z")); // 23:59 KST 07-16
    expect(isEditionPast("2026-07-16")).toBe(false);
    vi.setSystemTime(new Date("2026-07-16T15:00:00.000Z")); // 00:00 KST 07-17
    expect(isEditionPast("2026-07-16")).toBe(true);
  });
});

describe("formatPastEditionLabel", () => {
  it("formats a YYYY-MM-DD date as a Korean long date", () => {
    expect(formatPastEditionLabel("2026-07-13")).toBe("2026년 7월 13일");
  });
});
