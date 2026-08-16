import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AboutPage from "@/app/about/page";

/**
 * This page is the site's account of its own conduct, so a sentence here is
 * closer to a promise than to copy — and on 2026-08-16 two of them had been
 * false since the article foot changed three days earlier. Prose cannot
 * notice when the screen it describes moves; a test can.
 *
 * So the assertions below are about the *relationship* between this page and
 * the reader's screen, not about wording. Change the wording freely; if you
 * change what the reader can actually see, these should fail.
 */

afterEach(cleanup);

describe("about page", () => {
  it("does not promise source links, because articles no longer carry them", () => {
    // Removed from the reader on 2026-08-13 (ProvenanceNote.tsx). If the
    // outlet list ever comes back, delete this test rather than working
    // around it.
    render(<AboutPage />);
    expect(screen.queryByText(/원문 기사 링크/)).not.toBeInTheDocument();
    expect(screen.queryByText(/링크를 확인할 수 있어요/)).not.toBeInTheDocument();
  });

  it("tells the reader a model writes the articles", () => {
    render(<AboutPage />);
    expect(screen.getByText(/AI가 A2·B1·B2 세 단계 영어로 새로 써요/)).toBeInTheDocument();
  });

  it("tells the reader a person approves them before they publish", () => {
    // True by construction: publishToSupabase.ts is the only writer of
    // status=published and it takes an operator-approved list of ids.
    render(<AboutPage />);
    expect(screen.getByText(/사람이 검수한 뒤에만 발행돼요/)).toBeInTheDocument();
  });

  it("still describes the four steps the pipeline actually runs", () => {
    render(<AboutPage />);
    for (const step of ["수집", "교차 확인", "레벨별 재작성", "사람 검수 후 발행"]) {
      // Headings render as "1. 수집" across two text nodes, so match the role.
      expect(screen.getByRole("heading", { name: new RegExp(step) })).toBeInTheDocument();
    }
  });
});
