/**
 * RSS text cleanup.
 *
 * The entity decoder used to handle a hand-picked four (nbsp, amp, #39,
 * quot), so "McGregor&apos;s UFC comeback" reached the review console — and
 * the public deck, which is built from this same field — with the entity
 * showing. &apos; is the one XML-flavoured feeds reach for most.
 */

import { describe, expect, it } from "vitest";
import { MAX_ITEMS_PER_FEED, RECENCY_WINDOW_HOURS, selectFreshItems, stripHtml } from "./collect.js";
import type { RawItem } from "../types.js";

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

/**
 * Recency window + per-feed cap.
 *
 * Without them a run collected 2,231 items, of which 458 were older than 48
 * hours — items that can't join today's cluster but still cost an O(n²) sweep
 * and, often, a Haiku boundary call to prove they belong nowhere.
 */
describe("selectFreshItems", () => {
  const NOW = new Date("2026-08-11T12:00:00.000Z");
  const now = NOW.getTime();

  function item(overrides: Partial<RawItem> = {}): RawItem {
    return {
      outlet: "Outlet",
      url: "https://example.com/x",
      title: "Headline",
      summary: "",
      publishedAt: NOW.toISOString(),
      category: "world",
      guid: Math.random().toString(36),
      ...overrides,
    };
  }

  function hoursAgo(h: number): string {
    return new Date(now - h * 3_600_000).toISOString();
  }

  it("keeps items inside the window and drops the ones behind it", () => {
    const kept = selectFreshItems(
      [
        item({ guid: "fresh", publishedAt: hoursAgo(1) }),
        item({ guid: "edge", publishedAt: hoursAgo(RECENCY_WINDOW_HOURS) }),
        item({ guid: "stale", publishedAt: hoursAgo(RECENCY_WINDOW_HOURS + 1) }),
        item({ guid: "ancient", publishedAt: hoursAgo(24 * 21) }),
      ],
      now,
    );

    expect(kept.map((i) => i.guid)).toEqual(["fresh", "edge"]);
  });

  it("keeps undated items — one whole feed (Nikkei Asia) publishes no pubDate", () => {
    const kept = selectFreshItems(
      [item({ guid: "undated", publishedAt: null }), item({ guid: "unparsable", publishedAt: "not a date" })],
      now,
    );

    expect(kept.map((i) => i.guid)).toEqual(["undated", "unparsable"]);
  });

  it("keeps future-dated items — a feed running fast is not a reason to lose it", () => {
    const kept = selectFreshItems([item({ guid: "skewed", publishedAt: hoursAgo(-6) })], now);

    expect(kept.map((i) => i.guid)).toEqual(["skewed"]);
  });

  it("caps a feed at the newest MAX_ITEMS_PER_FEED items", () => {
    const flood = Array.from({ length: MAX_ITEMS_PER_FEED + 40 }, (_, idx) =>
      // Feed order is newest-first, so index 0 is the newest.
      item({ guid: `item-${idx}`, publishedAt: hoursAgo(idx * 0.25) }),
    );

    const kept = selectFreshItems(flood, now);

    expect(kept).toHaveLength(MAX_ITEMS_PER_FEED);
    expect(kept[0].guid).toBe("item-0");
    expect(kept[kept.length - 1].guid).toBe(`item-${MAX_ITEMS_PER_FEED - 1}`);
  });

  it("applies the cap AFTER the window, so a stale-topped feed still yields its fresh items", () => {
    const stale = Array.from({ length: MAX_ITEMS_PER_FEED }, (_, idx) =>
      item({ guid: `stale-${idx}`, publishedAt: hoursAgo(24 * 10) }),
    );
    const fresh = [item({ guid: "fresh-a", publishedAt: hoursAgo(2) }), item({ guid: "fresh-b", publishedAt: hoursAgo(3) })];

    const kept = selectFreshItems([...stale, ...fresh], now);

    expect(kept.map((i) => i.guid)).toEqual(["fresh-a", "fresh-b"]);
  });
});
