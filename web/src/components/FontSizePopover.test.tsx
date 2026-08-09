import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { FontSizePopover } from "@/components/FontSizePopover";

afterEach(cleanup);

describe("FontSizePopover — Esc closes the menu (docs/feature-status.md G10)", () => {
  it("opens on click and closes again on Escape", () => {
    render(<FontSizePopover />);
    const trigger = screen.getByRole("button", { name: "글자 크기 조절" });

    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "글자 크기" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "글자 크기" })).not.toBeInTheDocument();
  });

  it("does not throw when Escape is pressed while the menu is already closed", () => {
    render(<FontSizePopover />);
    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    expect(screen.queryByRole("menu", { name: "글자 크기" })).not.toBeInTheDocument();
  });
});
