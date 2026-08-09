import { describe, expect, it } from "vitest";
import { buildSeedBundle, splitSentences } from "./seedTransform";
import type { PipelineArticle, PipelineEdition } from "./pipelineTypes";

function makeArticle(overrides: Partial<PipelineArticle>): PipelineArticle {
  return {
    id: "art-1",
    slug: "some-slug",
    category: "world",
    rankInEdition: 1,
    status: "review",
    eventSummary: "Something happened.",
    sources: [
      { url: "https://a.example/1", outlet: "Outlet A", title: "A title", fetchMethod: "rss_summary" },
      { url: "https://b.example/1", outlet: "Outlet B", title: "B title", fetchMethod: "rss_summary" },
    ],
    facts: [
      {
        statement: "Fact one confirmed by both outlets.",
        confirmedByOutlets: ["Outlet A", "Outlet B"],
        sourceCount: 2,
        usedInText: true,
        searchSummaryOnly: false,
      },
      {
        statement: "Fact two, single source.",
        confirmedByOutlets: ["Outlet A"],
        sourceCount: 1,
        usedInText: false,
        searchSummaryOnly: true,
      },
    ],
    versions: [
      {
        version: {
          level: "A2",
          title: "A Simple Title",
          content: "First sentence here. Second sentence follows!\n\nThird one starts a new paragraph.",
          wordCount: 12,
          words: [
            { term: "example", meaningKo: "예시", example: "This is an example.", pronunciation: "ig-ZAM-pul", sortOrder: 1 },
          ],
        },
        checks: [],
        passed: true,
        rewriteAttempts: 1,
      },
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    reviewDecision: "approved",
    ...overrides,
  };
}

function makeEdition(articles: PipelineArticle[]): PipelineEdition {
  return { id: "edition-2026-07-13", editionDate: "2026-07-13", status: "draft", articles };
}

const CATEGORY_IDS = { world: 1, korea: 2, ai: 3, tech: 4, business: 5, culture: 9 };

describe("splitSentences", () => {
  it("splits on sentence-ending punctuation and collapses paragraph breaks", () => {
    const result = splitSentences("First one. Second one!\n\nThird paragraph starts here.");
    expect(result).toEqual(["First one.", "Second one!", "Third paragraph starts here."]);
  });

  it("returns an empty array for empty input", () => {
    expect(splitSentences("   \n\n  ")).toEqual([]);
  });
});

describe("buildSeedBundle", () => {
  it("only includes articles with reviewDecision === approved", () => {
    const approved = makeArticle({ id: "approved-1", reviewDecision: "approved" });
    const pending = makeArticle({ id: "pending-1", rankInEdition: 2, reviewDecision: "pending" });
    const excluded = makeArticle({ id: "excluded-1", rankInEdition: 3, reviewDecision: "excluded" });
    const bundle = buildSeedBundle(makeEdition([approved, pending, excluded]), CATEGORY_IDS, "2026-07-14T00:00:00.000Z");

    expect(bundle.articles).toHaveLength(1);
    expect(bundle.articles[0].id).toBe("article-2026-07-13-1");
  });

  it("derives deterministic ids for article/version/word/fact/source rows", () => {
    const bundle = buildSeedBundle(makeEdition([makeArticle({})]), CATEGORY_IDS, "2026-07-14T00:00:00.000Z");

    expect(bundle.edition.id).toBe("edition-2026-07-13");
    expect(bundle.articles[0].id).toBe("article-2026-07-13-1");
    expect(bundle.article_versions[0].id).toBe("version-2026-07-13-1-a2");
    expect(bundle.words[0].id).toBe("word-2026-07-13-1-a2-1");
    expect(bundle.facts[0].id).toBe("fact-2026-07-13-1-1");
    expect(bundle.sources[0].id).toBe("source-2026-07-13-1-1");
    expect(bundle.sources[1].id).toBe("source-2026-07-13-1-2");
  });

  it("maps pipeline category slugs to web category ids (ai-tech -> ai, culture-sports -> culture)", () => {
    const bundle1 = buildSeedBundle(
      makeEdition([makeArticle({ category: "ai-tech" })]),
      CATEGORY_IDS,
      "2026-07-14T00:00:00.000Z"
    );
    expect(bundle1.articles[0].category_id).toBe(3);

    const bundle2 = buildSeedBundle(
      makeEdition([makeArticle({ category: "culture-sports" })]),
      CATEGORY_IDS,
      "2026-07-14T00:00:00.000Z"
    );
    expect(bundle2.articles[0].category_id).toBe(9);
  });

  it("links fact_sources by matching confirmedByOutlets against sources[].outlet", () => {
    const bundle = buildSeedBundle(makeEdition([makeArticle({})]), CATEGORY_IDS, "2026-07-14T00:00:00.000Z");

    // Fact 1 confirmed by both outlets -> 2 fact_sources rows.
    const fact1Links = bundle.fact_sources.filter((fs) => fs.fact_id === "fact-2026-07-13-1-1");
    expect(fact1Links).toHaveLength(2);

    // Fact 2 confirmed by Outlet A only -> 1 fact_sources row.
    const fact2Links = bundle.fact_sources.filter((fs) => fs.fact_id === "fact-2026-07-13-1-2");
    expect(fact2Links).toHaveLength(1);
    expect(fact2Links[0].source_id).toBe("source-2026-07-13-1-1");
  });

  it("warns (never invents a source row) when confirmedByOutlets has no matching source", () => {
    const article = makeArticle({
      facts: [
        {
          statement: "Orphan fact.",
          confirmedByOutlets: ["Unknown Outlet"],
          sourceCount: 1,
          usedInText: false,
          searchSummaryOnly: false,
        },
      ],
    });
    const bundle = buildSeedBundle(makeEdition([article]), CATEGORY_IDS, "2026-07-14T00:00:00.000Z");

    expect(bundle.fact_sources).toHaveLength(0);
    expect(bundle.warnings.some((w) => w.includes("Unknown Outlet"))).toBe(true);
  });

  it("preserves facts.source_count from the pipeline's own computed value, not a recount", () => {
    const article = makeArticle({
      facts: [
        {
          statement: "Under-linked but pipeline says 2.",
          confirmedByOutlets: ["Outlet A"], // only 1 will actually link
          sourceCount: 2,
          usedInText: false,
          searchSummaryOnly: false,
        },
      ],
    });
    const bundle = buildSeedBundle(makeEdition([article]), CATEGORY_IDS, "2026-07-14T00:00:00.000Z");
    expect(bundle.facts[0].source_count).toBe(2);
  });

  it("keeps words' isKey and pos only when present, matching Word type optionality", () => {
    const article = makeArticle({
      versions: [
        {
          version: {
            level: "A2",
            title: "T",
            content: "One sentence.",
            wordCount: 2,
            words: [
              { term: "plain", meaningKo: "평범한", example: "e", pronunciation: "p", sortOrder: 1 },
              { term: "keyword", meaningKo: "핵심어", example: "e", pronunciation: "p", sortOrder: 2, isKey: true, pos: "n." },
            ],
          },
          checks: [],
          passed: true,
          rewriteAttempts: 1,
        },
      ],
    });
    const bundle = buildSeedBundle(makeEdition([article]), CATEGORY_IDS, "2026-07-14T00:00:00.000Z");

    expect(bundle.words[0].isKey).toBeUndefined();
    expect(bundle.words[0].pos).toBeUndefined();
    expect(bundle.words[1].isKey).toBe(true);
    expect(bundle.words[1].pos).toBe("n.");
  });
});
