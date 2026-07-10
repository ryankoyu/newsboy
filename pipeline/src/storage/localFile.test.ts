import { describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import { LocalFileStorageAdapter } from "./localFile.js";
import type { PipelineEdition, PipelineRun } from "../types.js";

function sampleEdition(): PipelineEdition {
  return {
    id: "edition-1",
    editionDate: "2026-07-10",
    status: "draft",
    articles: [
      {
        id: "article-1",
        slug: "sample-article-1",
        category: "world",
        rankInEdition: 1,
        status: "review",
        eventSummary: "Sample event",
        sources: [
          { url: "https://example.com/a", outlet: "Outlet A", title: "A", fetchMethod: "rss_summary" },
        ],
        facts: [
          {
            statement: "Something happened.",
            confirmedByOutlets: ["Outlet A", "Outlet B"],
            sourceCount: 2,
            usedInText: true,
            searchSummaryOnly: true,
          },
        ],
        versions: [
          {
            version: {
              level: "A2",
              title: "Sample title",
              content: "Sample content.",
              wordCount: 2,
              words: [
                { term: "sample", meaningKo: "샘플", example: "ex", pronunciation: "ipa", sortOrder: 0 },
              ],
            },
            checks: [
              { kind: "cefr", level: "A2", score: 10, passed: true, detail: {} },
            ],
            passed: true,
            rewriteAttempts: 1,
          },
        ],
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ],
  };
}

function sampleRun(): PipelineRun {
  return {
    id: "run-1",
    startedAt: "2026-07-10T00:00:00.000Z",
    finishedAt: "2026-07-10T00:05:00.000Z",
    editionDate: "2026-07-10",
    status: "success",
    stages: [
      {
        stage: "collect",
        startedAt: "2026-07-10T00:00:00.000Z",
        finishedAt: "2026-07-10T00:01:00.000Z",
        ok: true,
        detail: { totalItems: 10 },
      },
    ],
    articlesProduced: 1,
  };
}

describe("LocalFileStorageAdapter", () => {
  it("round-trips an edition through saveEdition/getEdition with full fidelity", async () => {
    const adapter = new LocalFileStorageAdapter();
    const edition = sampleEdition();

    await adapter.saveEdition(edition);
    const loaded = await adapter.getEdition(edition.editionDate);

    expect(loaded).toEqual(edition);

    // cleanup the real output dir written by this adapter (it resolves
    // relative to the source tree, not a temp dir — see localFile.ts OUTPUT_ROOT).
    const outputRoot = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../output",
    );
    await rm(path.join(outputRoot, "editions", `${edition.editionDate}.json`), { force: true });
  });

  it("returns null for an edition date that was never saved", async () => {
    const adapter = new LocalFileStorageAdapter();
    const loaded = await adapter.getEdition("1999-01-01");
    expect(loaded).toBeNull();
  });

  it("writes a pipeline_runs-shaped file per run id", async () => {
    const adapter = new LocalFileStorageAdapter();
    const run = sampleRun();
    await adapter.recordPipelineRun(run);

    const outputRoot = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../output",
    );
    const runFile = path.join(outputRoot, "runs", `${run.id}.json`);
    const raw = await import("node:fs/promises").then((fs) => fs.readFile(runFile, "utf-8"));
    expect(JSON.parse(raw)).toEqual(run);
    await rm(runFile, { force: true });
  });
});
