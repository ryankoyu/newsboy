/**
 * 반려(재생성 요청) 처리 — regenerate.ts.
 *
 * Uses MockLLMProvider (deterministic, no key) and an in-memory
 * StorageAdapter, so these assert the worker's contract with the console —
 * which articles it touches, what it writes back, what it leaves alone on
 * failure — not the quality of any generated text.
 */

import { describe, expect, it } from "vitest";
import type {
  ExtractedFact,
  PipelineArticle,
  PipelineCheckpoint,
  PipelineEdition,
  PipelineRun,
} from "../types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { LLMProvider } from "../llm/provider.js";
import { MockLLMProvider } from "../llm/mock.js";
import { articlesAwaitingRegeneration, regenerateRequestedArticles } from "./regenerate.js";

function fact(statement: string, outlets: string[]): ExtractedFact {
  return {
    statement,
    confirmedByOutlets: outlets,
    sourceCount: outlets.length,
    usedInText: true,
    searchSummaryOnly: true,
  };
}

function article(overrides: Partial<PipelineArticle> = {}): PipelineArticle {
  return {
    id: "art-1",
    slug: "central-bank-raises-rates-20260713-1",
    category: "business",
    rankInEdition: 1,
    status: "review",
    eventSummary: "Central bank raises interest rates",
    sources: [
      {
        url: "https://a.example/1",
        outlet: "Outlet A",
        title: "Central bank raises interest rates",
        fetchMethod: "rss_summary",
        summary:
          "The central bank raised its benchmark rate by half a point on Thursday, citing inflation.",
      },
      {
        url: "https://b.example/1",
        outlet: "Outlet B",
        title: "Rate rise announced",
        fetchMethod: "rss_summary",
        summary:
          "Officials increased the benchmark interest rate by half a percentage point on Thursday.",
      },
    ],
    facts: [
      fact("The central bank raised its benchmark rate by half a point.", ["Outlet A", "Outlet B"]),
      fact("The decision was announced on Thursday.", ["Outlet A", "Outlet B"]),
      fact("Officials cited persistent inflation pressure.", ["Outlet A", "Outlet B"]),
    ],
    versions: [
      {
        version: { level: "A2", title: "Old title", content: "Old body.", wordCount: 2, words: [] },
        checks: [{ kind: "cefr", level: "A2", score: 1, passed: true, detail: {} }],
        passed: true,
        rewriteAttempts: 1,
      },
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

function edition(articles: PipelineArticle[]): PipelineEdition {
  return {
    id: "edition-2026-07-13",
    editionDate: "2026-07-13",
    status: "draft",
    articles,
  };
}

class MemoryStorage implements StorageAdapter {
  readonly name = "memory";
  saves = 0;
  constructor(private edition: PipelineEdition | null) {}
  async saveEdition(next: PipelineEdition): Promise<void> {
    this.saves++;
    this.edition = structuredClone(next);
  }
  async recordPipelineRun(_run: PipelineRun): Promise<void> {}
  async getEdition(_date: string): Promise<PipelineEdition | null> {
    return this.edition ? structuredClone(this.edition) : null;
  }
  // Regeneration never checkpoints — it is one article, not a staged run.
  async saveCheckpoint(_checkpoint: PipelineCheckpoint): Promise<void> {}
  async loadCheckpoint(_date: string): Promise<PipelineCheckpoint | null> {
    return null;
  }
  async clearCheckpoint(_date: string): Promise<void> {}
  // Regeneration rewrites one article's prose; the dictionary is an
  // edition-level stage (run.ts), so these are never reached from this path.
  async saveGlosses(): Promise<void> {}
  async loadKnownGlossTerms(): Promise<Set<string>> {
    return new Set();
  }
}

/** A provider that fails generation — stands in for an API outage mid-request. */
function failingLLM(): LLMProvider {
  const mock = new MockLLMProvider();
  return {
    ...mock,
    name: "failing",
    judgeSameEvent: mock.judgeSameEvent.bind(mock),
    selectTop10: mock.selectTop10.bind(mock),
    extractFacts: mock.extractFacts.bind(mock),
    rewrite: mock.rewrite.bind(mock),
    judgeCefrBand: mock.judgeCefrBand.bind(mock),
    generateAllLevels: async () => {
      throw new Error("overloaded_error");
    },
  };
}

describe("articlesAwaitingRegeneration", () => {
  it("picks only articles the desk sent back", () => {
    const ed = edition([
      article({ id: "a", reviewDecision: "approved" }),
      article({ id: "b", reviewDecision: "regenerate", regenerateNote: "본문 다시" }),
      article({ id: "c", reviewDecision: "excluded", excludeReason: "중복" }),
      article({ id: "d" }),
    ]);
    expect(articlesAwaitingRegeneration(ed).map((a) => a.id)).toEqual(["b"]);
  });
});

describe("regenerateRequestedArticles", () => {
  it("rewrites the requested article and returns it to the desk as pending", async () => {
    const storage = new MemoryStorage(
      edition([
        article({ id: "a", reviewDecision: "approved" }),
        article({
          id: "b",
          rankInEdition: 2,
          reviewDecision: "regenerate",
          regenerateNote: "A2 본문이 너무 딱딱함",
        }),
      ]),
    );

    const result = await regenerateRequestedArticles("2026-07-13", {
      llm: new MockLLMProvider(),
      storage,
      log: () => {},
    });

    expect(result.requested).toBe(1);
    expect(result.regenerated).toBe(1);

    const after = await storage.getEdition("2026-07-13");
    const rewritten = after!.articles.find((a) => a.id === "b")!;
    // Back to the desk, not auto-approved: a1 §2 "사람 승인 없이는 절대 발행되지 않는다".
    expect(rewritten.reviewDecision).toBe("pending");
    expect(rewritten.regenerateRequestedAt).toBeUndefined();
    expect(rewritten.regenerationCount).toBe(1);
    expect(rewritten.regeneratedAt).toBeTruthy();
    // Three fresh levels replaced the single old one.
    expect(rewritten.versions.map((v) => v.version.level)).toEqual(["A2", "B1", "B2"]);
    expect(rewritten.versions[0].version.content).not.toBe("Old body.");
    // The untouched article is exactly as it was.
    expect(after!.articles.find((a) => a.id === "a")!.versions[0].version.content).toBe("Old body.");
  });

  it("keeps the slug even though the headline changed — published links must not 404", async () => {
    const storage = new MemoryStorage(
      edition([article({ reviewDecision: "regenerate", regenerateNote: "제목 다시" })]),
    );

    await regenerateRequestedArticles("2026-07-13", {
      llm: new MockLLMProvider(),
      storage,
      log: () => {},
    });

    const after = await storage.getEdition("2026-07-13");
    expect(after!.articles[0].slug).toBe("central-bank-raises-rates-20260713-1");
  });

  it("leaves the request standing when generation fails, and writes nothing", async () => {
    const storage = new MemoryStorage(
      edition([article({ reviewDecision: "regenerate", regenerateNote: "본문 다시" })]),
    );

    const result = await regenerateRequestedArticles("2026-07-13", {
      llm: failingLLM(),
      storage,
      log: () => {},
    });

    expect(result.regenerated).toBe(0);
    expect(result.outcomes[0].ok).toBe(false);
    expect(result.outcomes[0].error).toContain("overloaded_error");
    expect(storage.saves).toBe(0);

    const after = await storage.getEdition("2026-07-13");
    expect(after!.articles[0].reviewDecision).toBe("regenerate");
    expect(after!.articles[0].versions[0].version.content).toBe("Old body.");
  });

  it("warns when the stored sources have no snippets, since the n-gram gate then sees titles only", async () => {
    const stripped = article({
      reviewDecision: "regenerate",
      regenerateNote: "다시",
      sources: [
        {
          url: "https://a.example/1",
          outlet: "Outlet A",
          title: "Central bank raises interest rates",
          fetchMethod: "rss_summary",
        },
      ],
    });
    const storage = new MemoryStorage(edition([stripped]));

    const result = await regenerateRequestedArticles("2026-07-13", {
      llm: new MockLLMProvider(),
      storage,
      log: () => {},
    });

    expect(result.outcomes[0].ok).toBe(true);
    expect(result.outcomes[0].warnings.some((w) => w.includes("n-gram"))).toBe(true);
  });

  it("honours an explicit article-id filter", async () => {
    const storage = new MemoryStorage(
      edition([
        article({ id: "b", reviewDecision: "regenerate", regenerateNote: "하나" }),
        article({ id: "c", rankInEdition: 2, reviewDecision: "regenerate", regenerateNote: "둘" }),
      ]),
    );

    const result = await regenerateRequestedArticles("2026-07-13", {
      llm: new MockLLMProvider(),
      storage,
      articleIds: ["c"],
      log: () => {},
    });

    expect(result.requested).toBe(1);
    const after = await storage.getEdition("2026-07-13");
    expect(after!.articles.find((a) => a.id === "b")!.reviewDecision).toBe("regenerate");
    expect(after!.articles.find((a) => a.id === "c")!.reviewDecision).toBe("pending");
  });

  it("reports cost for every priced call it makes", async () => {
    const storage = new MemoryStorage(
      edition([article({ reviewDecision: "regenerate", regenerateNote: "다시" })]),
    );
    const stages: string[] = [];

    await regenerateRequestedArticles("2026-07-13", {
      llm: new MockLLMProvider(),
      storage,
      onUsage: ({ stage }) => stages.push(stage),
      log: () => {},
    });

    expect(stages).toContain("rewrite");
  });

  it("throws for an edition that does not exist", async () => {
    const storage = new MemoryStorage(null);
    await expect(
      regenerateRequestedArticles("2099-01-01", { llm: new MockLLMProvider(), storage, log: () => {} }),
    ).rejects.toThrow(/Edition not found/);
  });
});
