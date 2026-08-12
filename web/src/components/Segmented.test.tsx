import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Segmented } from "@/components/Segmented";

/**
 * Segmented carries a roving tabindex, which means Tab reaches exactly one
 * option — the selected one. Without arrow keys the other options are
 * unreachable by keyboard entirely, and this control IS the level switcher
 * and the type-size setting in both skins.
 */

const OPTIONS = [
  { value: "A2", label: "A2" },
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
];

afterEach(() => {
  cleanup();
});

function renderSegmented(value: string) {
  const onChange = vi.fn();
  render(
    <Segmented options={OPTIONS} value={value} onChange={onChange} ariaLabel="레벨" />
  );
  return onChange;
}

describe("Segmented — keyboard", () => {
  it("moves to the next option on ArrowRight/ArrowDown", () => {
    const onChange = renderSegmented("A2");
    fireEvent.keyDown(screen.getByRole("tab", { name: "A2" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("B1");

    fireEvent.keyDown(screen.getByRole("tab", { name: "A2" }), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("B1");
  });

  it("moves to the previous option on ArrowLeft, wrapping around the ends", () => {
    const onChange = renderSegmented("A2");
    fireEvent.keyDown(screen.getByRole("tab", { name: "A2" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("B2");
  });

  it("jumps to the first and last option on Home/End", () => {
    const onChange = renderSegmented("B1");
    const selected = screen.getByRole("tab", { name: "B1" });

    fireEvent.keyDown(selected, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("B2");

    fireEvent.keyDown(selected, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("A2");
  });

  it("takes focus with the selection, so the next arrow press continues from there", () => {
    renderSegmented("A2");
    fireEvent.keyDown(screen.getByRole("tab", { name: "A2" }), { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "B1" }));
  });

  it("leaves other keys alone", () => {
    const onChange = renderSegmented("A2");
    fireEvent.keyDown(screen.getByRole("tab", { name: "A2" }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
