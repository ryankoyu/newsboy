import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SmartDictionary } from "@/components/SmartDictionary";

// jsdom doesn't implement matchMedia — SmartDictionary calls it directly
// (mobile-vs-desktop layout branch), so every render needs a stub.
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

describe("SmartDictionary — part of speech slot (docs/feature-status.md G9)", () => {
  it("shows the pos badge when the entry has one", () => {
    render(
      <SmartDictionary
        entry={{
          term: "settlers",
          pronunciation: "/ˈsetlərz/",
          meaning_ko: "정착민",
          example: "The settlers moved in.",
          pos: "n.",
        }}
        anchorRect={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("n.")).toBeInTheDocument();
    expect(screen.getByText("정착민")).toBeInTheDocument();
  });

  it("renders fine with no pos field at all — no crash, no placeholder text", () => {
    render(
      <SmartDictionary
        entry={{
          term: "detained",
          pronunciation: "/dɪˈteɪnd/",
          meaning_ko: "억류된",
          example: "He was detained.",
        }}
        anchorRect={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("억류된")).toBeInTheDocument();
    expect(screen.queryByText(/^n\.$|^v\.$|^adj\.$/)).not.toBeInTheDocument();
  });

  it("renders fine for a minimal DictionaryEntry (uncatalogued word, no meaning at all)", () => {
    render(
      <SmartDictionary
        entry={{ term: "xyzzy", pronunciation: null, meaning_ko: null, example: null }}
        anchorRect={null}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/사전에 없어요/)).toBeInTheDocument();
  });
});

describe("SmartDictionary — Esc closes the dialog", () => {
  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <SmartDictionary
        entry={{ term: "settlers", pronunciation: null, meaning_ko: "정착민", example: null }}
        anchorRect={null}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
