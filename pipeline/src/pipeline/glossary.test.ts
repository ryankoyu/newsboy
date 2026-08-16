import { describe, expect, it, vi } from "vitest";
import { buildGlossary, collectGlossTerms, glossKey, mayPersistGlosses } from "./glossary.js";
import type { GatedVersion, PipelineArticle } from "../types.js";
import type { LLMProvider } from "../llm/provider.js";

function version(level: "A2" | "B1" | "B2", content: string): GatedVersion {
  return {
    version: { level, title: "T", content, wordCount: content.split(/\s+/).length, words: [] },
    checks: [],
    passed: true,
    rewriteAttempts: 1,
  };
}

function article(versions: GatedVersion[]): PipelineArticle {
  return {
    id: "a1",
    slug: "a1",
    category: "world",
    rankInEdition: 1,
    status: "review",
    eventSummary: "An event",
    sources: [],
    facts: [],
    versions,
    createdAt: "2026-08-16T00:00:00.000Z",
  };
}

describe("collectGlossTerms", () => {
  it("collects every word a reader could tap, across all three levels", () => {
    const terms = collectGlossTerms([
      article([
        version("A2", "The ferry capsized near the port."),
        version("B1", "Rescuers searched overnight."),
        version("B2", "Investigators cited overcrowding."),
      ]),
    ]);
    expect(terms).toContain("ferry");
    expect(terms).toContain("rescuers");
    expect(terms).toContain("investigators");
  });

  it("drops function words, short tokens, and anything with a digit", () => {
    const terms = collectGlossTerms([
      article([version("A2", "The ship of 44 people was at sea by 2026 and it is gone.")]),
    ]);
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("of");
    expect(terms).not.toContain("was");
    expect(terms).not.toContain("at"); // under the 3-letter floor
    expect(terms).not.toContain("44");
    expect(terms).not.toContain("2026");
    expect(terms).toEqual(expect.arrayContaining(["ship", "people", "sea", "gone"]));
  });

  it("keeps inflected forms as they appear rather than reducing them", () => {
    // The reader taps what is on the page. A gloss stored under "company"
    // would never be found for "companies" — web/src/lib/wordMatcher.ts is
    // explicit that inflection matching is only ever approximate.
    const terms = collectGlossTerms([
      article([version("A2", "Companies reported losses. One company reported none.")]),
    ]);
    expect(terms).toContain("companies");
    expect(terms).toContain("company");
    expect(terms).toContain("reported");
  });

  it("deduplicates across levels and returns a stable order", () => {
    const input = [
      article([
        version("A2", "Exports fell."),
        version("B1", "Exports fell sharply."),
        version("B2", "Exports fell sharply again."),
      ]),
    ];
    const first = collectGlossTerms(input);
    expect(first.filter((t) => t === "exports")).toHaveLength(1);
    // Stable order is what lets a rerun of the same edition hit the prompt cache.
    expect(collectGlossTerms(input)).toEqual(first);
  });

  it("normalizes case and curly apostrophes the way the reader's lookup does", () => {
    const terms = collectGlossTerms([
      article([version("A2", "Seoul’s WEATHER worsened. The city’s response was slow.")]),
    ]);
    expect(terms).toContain("weather");
    expect(terms).toContain("seoul's");
    expect(glossKey(" Seoul’s ")).toBe("seoul's");
  });
});

/** Returns a gloss for every term it is asked about. */
function llmGlossingAll(): LLMProvider {
  return {
    generateGlosses: async ({ terms }: { terms: string[] }) => ({
      entries: terms.map((term) => ({ term, meaningKo: `${term} 뜻`, pos: "n." })),
      usage: { inputTokens: 10, outputTokens: 20, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
    }),
  } as unknown as LLMProvider;
}

describe("buildGlossary", () => {
  it("glosses the terms and reports usage", async () => {
    const result = await buildGlossary({
      terms: ["ferry", "port"],
      known: new Set(),
      llm: llmGlossingAll(),
    });
    expect(result.entries).toEqual([
      { term: "ferry", meaningKo: "ferry 뜻", pos: "n." },
      { term: "port", meaningKo: "port 뜻", pos: "n." },
    ]);
    expect(result.usage.outputTokens).toBe(20);
  });

  it("does not pay to regenerate a term the store already has", async () => {
    const llm = llmGlossingAll();
    const spy = vi.spyOn(llm, "generateGlosses" as never);
    const result = await buildGlossary({
      terms: ["ferry", "port", "rescuers"],
      known: new Set(["ferry", "port"]),
      llm,
    });
    expect(result.alreadyKnown).toBe(2);
    expect(result.entries.map((e) => e.term)).toEqual(["rescuers"]);
    expect(spy).toHaveBeenCalledWith({ terms: ["rescuers"] });
  });

  it("makes no call at all when every term is already known", async () => {
    const llm = llmGlossingAll();
    const spy = vi.spyOn(llm, "generateGlosses" as never);
    const result = await buildGlossary({
      terms: ["ferry"],
      known: new Set(["ferry"]),
      llm,
    });
    expect(spy).not.toHaveBeenCalled();
    expect(result.entries).toEqual([]);
  });

  it("stores nothing for a word the model declined to gloss", async () => {
    // What the prompt asks for on a proper noun. An empty gloss would replace
    // the honest "뜻 준비 중" card with a blank one.
    const llm = {
      generateGlosses: async () => ({
        entries: [
          { term: "nikkei", meaningKo: null },
          { term: "ferry", meaningKo: "여객선", pos: "n." },
          { term: "yonhap", meaningKo: "   " },
        ],
      }),
    } as unknown as LLMProvider;
    const result = await buildGlossary({
      terms: ["nikkei", "ferry", "yonhap"],
      known: new Set(),
      llm,
    });
    expect(result.entries).toEqual([{ term: "ferry", meaningKo: "여객선", pos: "n." }]);
  });

  it("ignores a word the model volunteered but was never asked about", async () => {
    const llm = {
      generateGlosses: async () => ({
        entries: [
          { term: "ferry", meaningKo: "여객선" },
          { term: "submarine", meaningKo: "잠수함" }, // not in the request
        ],
      }),
    } as unknown as LLMProvider;
    const result = await buildGlossary({ terms: ["ferry"], known: new Set(), llm });
    expect(result.entries.map((e) => e.term)).toEqual(["ferry"]);
  });

  it("chunks large word lists", async () => {
    const llm = llmGlossingAll();
    const spy = vi.spyOn(llm, "generateGlosses" as never);
    const terms = Array.from({ length: 250 }, (_, i) => `word${String(i).padStart(3, "0")}`);
    const result = await buildGlossary({ terms, known: new Set(), llm, chunkSize: 100 });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(result.entries).toHaveLength(250);
  });

  it("keeps the other chunks when one call fails — a dictionary must not cost readers their news", async () => {
    let call = 0;
    const llm = {
      generateGlosses: async ({ terms }: { terms: string[] }) => {
        call++;
        if (call === 1) throw new Error("429");
        return { entries: terms.map((term) => ({ term, meaningKo: `${term} 뜻` })) };
      },
    } as unknown as LLMProvider;
    const result = await buildGlossary({
      terms: ["a1a", "b2b", "c3c", "d4d"],
      known: new Set(),
      llm,
      chunkSize: 2,
    });
    expect(result.failedChunks).toBe(1);
    expect(result.entries.map((e) => e.term)).toEqual(["c3c", "d4d"]);
  });

  it("degrades to no glosses on a provider that cannot gloss", async () => {
    const result = await buildGlossary({
      terms: ["ferry"],
      known: new Set(),
      llm: {} as unknown as LLMProvider,
    });
    expect(result.entries).toEqual([]);
    expect(result.failedChunks).toBe(0);
  });
});

describe("mayPersistGlosses", () => {
  it("lets a real provider write to the dictionary", () => {
    expect(mayPersistGlosses({ name: "anthropic" })).toBe(true);
  });

  it("refuses to write mock glosses", () => {
    // Mock articles are stored and an operator is trusted not to publish them.
    // A gloss has no equivalent gate: it is global, nothing reviews it, and
    // storing a term stops any real run from ever buying it.
    expect(mayPersistGlosses({ name: "mock" })).toBe(false);
  });
});
