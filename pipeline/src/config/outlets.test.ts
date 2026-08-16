import { describe, expect, it } from "vitest";
import { countIndependentOutlets, isAggregatorOutlet } from "./outlets.js";
import type { OutletIdentitySource } from "./outlets.js";

const item = (outlet: string, outletKey?: string): OutletIdentitySource => ({
  outlet,
  outletKey,
});

/** The items behind the 2026-08-12 Zhu Rongji story: one newsroom, one pointer to it. */
const nikkeiPlusAggregator = [
  item("Nikkei Asia", "nikkei"),
  item("Google News (Economy)", "google-news"),
];

describe("countIndependentOutlets", () => {
  it("counts two real newsrooms as two", () => {
    const items = [item("BBC World", "bbc"), item("The Guardian World", "guardian")];
    expect(countIndependentOutlets(["BBC World", "The Guardian World"], items)).toBe(2);
  });

  it("does not count an aggregator as a newsroom — the 2026-08-12 shape", () => {
    expect(
      countIndependentOutlets(["Nikkei Asia", "Google News (Economy)"], nikkeiPlusAggregator),
    ).toBe(1);
  });

  it("collapses two feeds of one outlet into one source", () => {
    // Korea Herald's category feeds carry the same outletKey; before this,
    // one article arriving through both read as two independent confirmations.
    const items = [
      item("Korea Herald (Sports)", "koreaherald"),
      item("Korea Herald (Life & Culture)", "koreaherald"),
    ];
    expect(
      countIndependentOutlets(["Korea Herald (Sports)", "Korea Herald (Life & Culture)"], items),
    ).toBe(1);
  });

  it("still counts a real second outlet when an aggregator is also listed", () => {
    const items = [...nikkeiPlusAggregator, item("Yonhap English", "yonhap")];
    expect(
      countIndependentOutlets(
        ["Nikkei Asia", "Google News (Economy)", "Yonhap English"],
        items,
      ),
    ).toBe(2);
  });

  it("deduplicates a name repeated twice", () => {
    const items = [item("BBC World", "bbc")];
    expect(countIndependentOutlets(["BBC World", "BBC World"], items)).toBe(1);
  });

  it("matches names case-insensitively and ignores surrounding whitespace", () => {
    const items = [item("BBC World", "bbc"), item("Google News (AI)", "google-news")];
    expect(countIndependentOutlets(["  bbc world ", "GOOGLE NEWS (AI)"], items)).toBe(1);
  });

  it("counts a name that matches no item, rather than silently dropping it", () => {
    // The model naming an outlet that is not in the input is a defect, but
    // it is not this function's to decide; dropping it here would tighten
    // the gate by an unmeasured amount.
    expect(countIndependentOutlets(["Reuters", "AP"], [item("BBC World", "bbc")])).toBe(2);
  });

  it("catches an unmatched aggregator name by name, since there is no key to check", () => {
    expect(countIndependentOutlets(["Nikkei Asia", "Google News"], [])).toBe(1);
  });

  it("falls back to the outlet name when an item carries no outletKey", () => {
    // Hand-built fixtures omit outletKey; two different names must stay two.
    expect(
      countIndependentOutlets(["Outlet A", "Outlet B"], [item("Outlet A"), item("Outlet B")]),
    ).toBe(2);
  });

  it("is zero for a fact confirmed by nobody", () => {
    expect(countIndependentOutlets([], nikkeiPlusAggregator)).toBe(0);
  });
});

describe("isAggregatorOutlet", () => {
  it("judges by outletKey when the item is known", () => {
    expect(isAggregatorOutlet("Google News (World)", "google-news")).toBe(true);
    expect(isAggregatorOutlet("Nikkei Asia", "nikkei")).toBe(false);
  });

  it("does not let a newsroom-shaped name override a known non-aggregator key", () => {
    // If sources.ts ever labels a real newsroom's feed with "news" in the
    // name, the key is the authority — not the string.
    expect(isAggregatorOutlet("NPR News", "npr")).toBe(false);
  });

  it("falls back to the name only when there is no key", () => {
    expect(isAggregatorOutlet("Google News")).toBe(true);
    expect(isAggregatorOutlet("BBC World")).toBe(false);
  });
});
