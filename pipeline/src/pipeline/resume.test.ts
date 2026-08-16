/**
 * Resume-from-last-checkpoint — a1-architecture.md §2 "각 단계는 DB에 상태를
 * 남기고 끝난다. 어느 단계에서 죽어도 마지막 성공 지점부터 재개한다."
 *
 * These drive runPipeline() with an in-memory StorageAdapter and a seeded
 * checkpoint, so no network and no API key are involved: `sources: []` proves
 * a skipped collect stage really was skipped — had it run, the edition would
 * have come out empty.
 */

import { describe, expect, it, vi } from "vitest";
import type {
  ExtractedFact,
  GlossEntry,
  PipelineCheckpoint,
  PipelineEdition,
  PipelineRun,
  RawItem,
  SelectedEvent,
} from "../types.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { GenerateAllLevelsInput, LLMProvider } from "../llm/provider.js";
import { MockLLMProvider } from "../llm/mock.js";
import { runPipeline } from "./run.js";

function rawItem(outlet: string, title: string, summary: string): RawItem {
  return {
    outlet,
    url: `https://${outlet.toLowerCase().replace(/\s/g, "")}.example/1`,
    title,
    summary,
    publishedAt: "2026-08-10T00:00:00.000Z",
    category: "world",
    guid: `${outlet}-${title}`,
    outletKey: outlet.toLowerCase().replace(/\s/g, "-"),
    country: "GB",
  };
}

function facts(): ExtractedFact[] {
  return [
    {
      statement: "Talks between the two governments resumed on Monday.",
      confirmedByOutlets: ["Outlet A", "Outlet B"],
      sourceCount: 2,
      usedInText: true,
      searchSummaryOnly: true,
    },
    {
      statement: "Both sides described the meeting as constructive.",
      confirmedByOutlets: ["Outlet A", "Outlet B"],
      sourceCount: 2,
      usedInText: true,
      searchSummaryOnly: true,
    },
    {
      statement: "A follow-up session is planned for next month.",
      confirmedByOutlets: ["Outlet A", "Outlet B"],
      sourceCount: 2,
      usedInText: true,
      searchSummaryOnly: true,
    },
  ];
}

function selectedEvent(id: string, rank: number, title: string): SelectedEvent {
  const items = [
    rawItem("Outlet A", title, "Talks between the two governments resumed on Monday."),
    rawItem("Outlet B", title, "Both sides described the meeting as constructive."),
  ];
  return {
    id,
    title,
    category: "world",
    items,
    outletCount: 2,
    outletKeys: ["outlet-a", "outlet-b"],
    countries: ["GB"],
    earliestPublishedAt: "2026-08-10T00:00:00.000Z",
    latestPublishedAt: "2026-08-10T00:00:00.000Z",
    rankInEdition: rank,
    selectionRationale: "test",
  };
}

/** Checkpoint standing at "extract finished, rewrite not started". */
function checkpointAfterExtract(
  editionDate: string,
  events: SelectedEvent[],
  ageHours = 0,
): PipelineCheckpoint {
  return {
    editionDate,
    runId: "earlier-run",
    updatedAt: new Date(Date.now() - ageHours * 3600_000).toISOString(),
    collect: { items: events.flatMap((e) => e.items), sourceReport: [] },
    cluster: events,
    select: {
      selected: events,
      heldBack: [],
      report: {
        editionDate,
        generatedAt: new Date().toISOString(),
        quota: { world: 3, korea: 2, "ai-tech": 2, business: 2, "culture-sports": 1 },
        candidates: [],
        backfills: [],
        finalOrder: events.map((e) => e.id),
        limitations: [],
      },
    },
    extract: {
      events: events.map((e) => ({
        eventId: e.id,
        category: e.category,
        facts: facts(),
        sourceItems: e.items,
      })),
      resolvedEvents: events,
      factsExtracted: 3 * events.length,
      factsUsedInText: 3 * events.length,
      replacements: [],
    },
  };
}

class MemoryStorage implements StorageAdapter {
  readonly name = "memory";
  edition: PipelineEdition | null = null;
  checkpoint: PipelineCheckpoint | null;
  checkpointWrites = 0;
  cleared = false;

  constructor(checkpoint: PipelineCheckpoint | null = null) {
    this.checkpoint = checkpoint;
  }
  async saveEdition(edition: PipelineEdition): Promise<void> {
    this.edition = structuredClone(edition);
  }
  async recordPipelineRun(_run: PipelineRun): Promise<void> {}
  async getEdition(_date: string): Promise<PipelineEdition | null> {
    return this.edition;
  }
  async saveCheckpoint(checkpoint: PipelineCheckpoint): Promise<void> {
    this.checkpointWrites++;
    this.checkpoint = structuredClone(checkpoint);
  }
  async loadCheckpoint(_date: string): Promise<PipelineCheckpoint | null> {
    return this.checkpoint ? structuredClone(this.checkpoint) : null;
  }
  async clearCheckpoint(_date: string): Promise<void> {
    this.cleared = true;
    this.checkpoint = null;
  }
  async getVersionBodies(_date: string): Promise<string[]> {
    return (this.edition?.articles ?? []).flatMap((a) =>
      a.versions.map((g) => g.version.content),
    );
  }
  /** The dictionary (glossary.ts) — recorded so a test can assert what was written. */
  glosses: GlossEntry[] = [];
  async saveGlosses(entries: readonly GlossEntry[]): Promise<void> {
    this.glosses.push(...entries);
  }
  async loadKnownGlossTerms(): Promise<Set<string>> {
    return new Set(this.glosses.map((g) => g.term));
  }
}

/** Mock provider that throws on the Nth generateAllLevels call (1-based). */
function llmFailingOnCall(failAt: number): { llm: LLMProvider; calls: () => number } {
  const mock = new MockLLMProvider();
  let calls = 0;
  const llm: LLMProvider = {
    name: "mock-failing",
    judgeSameEvent: (i) => mock.judgeSameEvent(i),
    selectTop10: (c) => mock.selectTop10(c),
    extractFacts: (i) => mock.extractFacts(i),
    rewrite: (i) => mock.rewrite(i),
    judgeCefrBand: (i) => mock.judgeCefrBand(i),
    generateAllLevels: async (input: GenerateAllLevelsInput) => {
      calls++;
      if (calls === failAt) throw new Error("api_error: overloaded");
      return mock.generateAllLevels(input);
    },
  };
  return { llm, calls: () => calls };
}

const EDITION_DATE = "2026-08-10";

describe("runPipeline resume", () => {
  it("skips checkpointed stages instead of re-running them", async () => {
    const events = [selectedEvent("evt-1", 1, "Two governments resume talks after long pause")];
    const storage = new MemoryStorage(checkpointAfterExtract(EDITION_DATE, events));

    const run = await runPipeline({
      // Empty source list: if collect had actually run, there would be no
      // items, no clusters, and no articles at the end.
      sources: [],
      llm: new MockLLMProvider(),
      storage,
      editionDate: EDITION_DATE,
      log: () => {},
    });

    expect(run.status).toBe("success");
    expect(run.resumedStages).toEqual(["collect", "cluster", "select", "extract"]);
    expect(run.articlesProduced).toBe(1);
    expect(storage.edition?.articles[0].versions).toHaveLength(3);
  });

  it("clears the checkpoint once the edition is stored", async () => {
    const events = [selectedEvent("evt-1", 1, "Two governments resume talks after long pause")];
    const storage = new MemoryStorage(checkpointAfterExtract(EDITION_DATE, events));

    await runPipeline({
      sources: [],
      llm: new MockLLMProvider(),
      storage,
      editionDate: EDITION_DATE,
      log: () => {},
    });

    expect(storage.cleared).toBe(true);
    expect(storage.checkpoint).toBeNull();
  });

  it("keeps articles already written when a later event's rewrite dies, and does not rewrite them on the next run", async () => {
    const events = [
      selectedEvent("evt-1", 1, "Two governments resume talks after long pause"),
      selectedEvent("evt-2", 2, "Coastal city completes flood defence project"),
    ];
    const storage = new MemoryStorage(checkpointAfterExtract(EDITION_DATE, events));

    // Run 1: first event succeeds, second throws.
    const failing = llmFailingOnCall(2);
    const failed = await runPipeline({
      sources: [],
      llm: failing.llm,
      storage,
      editionDate: EDITION_DATE,
      log: () => {},
    });

    expect(failed.status).toBe("failed");
    expect(storage.checkpoint?.articles).toHaveLength(1);
    expect(storage.checkpoint?.articles?.[0].id).toBe("evt-1");
    expect(storage.edition).toBeNull();

    // Run 2: only the missing event is generated.
    const second = llmFailingOnCall(0); // never fails
    const ok = await runPipeline({
      sources: [],
      llm: second.llm,
      storage,
      editionDate: EDITION_DATE,
      log: () => {},
    });

    expect(ok.status).toBe("success");
    expect(second.calls()).toBe(1); // evt-1 was restored, not rewritten
    expect(ok.articlesProduced).toBe(2);
    expect(storage.edition?.articles.map((a) => a.rankInEdition)).toEqual([1, 2]);
  });

  it("ignores a checkpoint older than the freshness window", async () => {
    const events = [selectedEvent("evt-1", 1, "Two governments resume talks after long pause")];
    const storage = new MemoryStorage(checkpointAfterExtract(EDITION_DATE, events, 30));

    const run = await runPipeline({
      sources: [],
      llm: new MockLLMProvider(),
      storage,
      editionDate: EDITION_DATE,
      log: () => {},
    });

    // Stale checkpoint dropped -> collect really ran (on zero sources) ->
    // nothing to write. Stale news is not silently reused.
    expect(run.resumedStages).toBeUndefined();
    expect(run.articlesProduced).toBe(0);
  });

  it("resume:false starts over even with a fresh checkpoint", async () => {
    const events = [selectedEvent("evt-1", 1, "Two governments resume talks after long pause")];
    const storage = new MemoryStorage(checkpointAfterExtract(EDITION_DATE, events));
    const loadSpy = vi.spyOn(storage, "loadCheckpoint");

    const run = await runPipeline({
      sources: [],
      llm: new MockLLMProvider(),
      storage,
      editionDate: EDITION_DATE,
      resume: false,
      log: () => {},
    });

    expect(loadSpy).not.toHaveBeenCalled();
    expect(run.resumedStages).toBeUndefined();
    expect(run.articlesProduced).toBe(0);
  });

  it("checkpoints each stage on a clean run so a later failure has somewhere to resume from", async () => {
    const storage = new MemoryStorage(null);

    await runPipeline({
      sources: [],
      llm: new MockLLMProvider(),
      storage,
      editionDate: EDITION_DATE,
      log: () => {},
    });

    // collect + cluster + select + extract, even with nothing to process.
    expect(storage.checkpointWrites).toBeGreaterThanOrEqual(4);
  });
});
