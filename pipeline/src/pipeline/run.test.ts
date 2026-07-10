import { describe, expect, it } from "vitest";
import { slugify } from "./run.js";

describe("slugify", () => {
  it("produces a lowercase, hyphenated slug with the rank suffix appended", () => {
    expect(slugify("Company Announces New Product", 3)).toBe(
      "company-announces-new-product-3",
    );
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(slugify("Wow!! What's Next? (Really)", 1)).toBe("wow-whats-next-really-1");
  });

  it("produces distinct slugs for two identical titles at different ranks (same-day uniqueness)", () => {
    const a = slugify("Tech Company Announces Layoffs", 2);
    const b = slugify("Tech Company Announces Layoffs", 7);
    expect(a).not.toBe(b);
    expect(a).toBe("tech-company-announces-layoffs-2");
    expect(b).toBe("tech-company-announces-layoffs-7");
  });

  it("falls back to a random slug when the title has no usable characters", () => {
    const slug = slugify("???!!!", 5);
    expect(slug.endsWith("-5")).toBe(true);
    expect(slug).toMatch(/^article-[a-f0-9]{8}-5$/);
  });

  it("truncates very long titles to keep the human-readable prefix bounded", () => {
    const longTitle = "word ".repeat(50).trim();
    const slug = slugify(longTitle, 1);
    // base is capped at 60 chars before the rank suffix is appended.
    const base = slug.slice(0, slug.lastIndexOf("-1"));
    expect(base.length).toBeLessThanOrEqual(60);
  });
});
