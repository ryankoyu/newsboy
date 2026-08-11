/**
 * RSS text cleanup.
 *
 * The entity decoder used to handle a hand-picked four (nbsp, amp, #39,
 * quot), so "McGregor&apos;s UFC comeback" reached the review console — and
 * the public deck, which is built from this same field — with the entity
 * showing. &apos; is the one XML-flavoured feeds reach for most.
 */

import { describe, expect, it } from "vitest";
import { stripHtml } from "./collect.js";

describe("stripHtml", () => {
  it("decodes &apos; — the entity that shipped to readers", () => {
    expect(stripHtml("McGregor&apos;s UFC comeback ends early")).toBe(
      "McGregor's UFC comeback ends early",
    );
  });

  it("decodes the entities it always handled", () => {
    expect(stripHtml("Tom &amp; Jerry")).toBe("Tom & Jerry");
    expect(stripHtml("It&#39;s here")).toBe("It's here");
    expect(stripHtml("She said &quot;no&quot;")).toBe('She said "no"');
    expect(stripHtml("a&nbsp;b")).toBe("a b");
  });

  it("decodes numeric entities in both bases", () => {
    expect(stripHtml("caf&#233;")).toBe("café");
    expect(stripHtml("it&#x2019;s")).toBe("it’s");
  });

  it("decodes typographic entities news copy actually uses", () => {
    expect(stripHtml("half&ndash;done &hellip; &lsquo;quoted&rsquo;")).toBe(
      "half–done … ‘quoted’",
    );
  });

  it("decodes each entity exactly once", () => {
    // Decoding &amp; in a separate earlier pass turned the literal text
    // "&amp;#39;" into an apostrophe, when the publisher wrote "&#39;".
    expect(stripHtml("&amp;#39;")).toBe("&#39;");
  });

  it("leaves an unknown entity alone rather than guessing", () => {
    expect(stripHtml("a &notarealentity; b")).toBe("a &notarealentity; b");
  });

  it("strips tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });

  it("returns an empty string for missing input", () => {
    expect(stripHtml(undefined)).toBe("");
  });
});
