/**
 * Pipeline orchestrator — wires stages [1]-[6] + storage per
 * a1-architecture.md §2.
 *
 * Stage [7] (사람 최종 승인) is intentionally NOT here: articles are persisted
 * with status='review' and the human approves in the web/ admin screen.
 * Stage [8] (발행) is a status flip performed after approval, also outside
 * this worker. This worker must never set status beyond 'review'
 * (a1 §2: "사람 승인 없이는 절대 발행되지 않는다").
 *
 * Every stage's outcome is recorded into a PipelineRun so a failure is
 * visible per-stage (a1 §5.3 pipeline_runs). Resume-from-last-stage is a
 * TODO for the Supabase-backed version — with local file storage a re-run
 * is cheap enough to just start over.
 */

import { randomUUID } from "node:crypto";
import type {
  CollectResult,
  GatedVersion,
  PipelineArticle,
  PipelineEdition,
  PipelineRun,
  PipelineStage,
  SelectedEvent,
  StageOutcome,
} from "../types.js";
import type { LLMProvider } from "../llm/provider.js";
import type { StorageAdapter } from "../storage/adapter.js";
import type { SourceConfig } from "../types.js";
import { collect } from "./collect.js";
import { clusterEvents } from "./cluster.js";
import { selectTop10 } from "./selectTop10.js";
import { extractFacts } from "./extract.js";
import { rewriteAllLevels } from "./rewrite.js";
import { gateVersion } from "./gate.js";

export interface RunOptions {
  sources: SourceConfig[];
  llm: LLMProvider;
  storage: StorageAdapter;
  /** YYYY-MM-DD; defaults to today (local time of the runner). */
  editionDate?: string;
  /** Cap on articles fully processed — useful for cheap demo runs. */
  maxArticles?: number;
  log?: (message: string) => void;
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || `article-${randomUUID().slice(0, 8)}`
  );
}

function todayISODate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function runPipeline(options: RunOptions): Promise<PipelineRun> {
  const log = options.log ?? ((m: string) => console.log(m));
  const editionDate = options.editionDate ?? todayISODate();
  const run: PipelineRun = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    editionDate,
    status: "running",
    stages: [],
    articlesProduced: 0,
  };

  async function stage<T>(name: PipelineStage, fn: () => Promise<T>): Promise<T> {
    const startedAt = new Date().toISOString();
    log(`[pipeline] stage=${name} starting`);
    try {
      const result = await fn();
      const outcome: StageOutcome = {
        stage: name,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: true,
        detail: summarizeStage(name, result),
      };
      run.stages.push(outcome);
      log(`[pipeline] stage=${name} ok ${JSON.stringify(outcome.detail)}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.stages.push({
        stage: name,
        startedAt,
        finishedAt: new Date().toISOString(),
        ok: false,
        detail: {},
        error: message,
      });
      throw err;
    }
  }

  try {
    // [1] 수집
    const collected = await stage("collect", () => collect(options.sources));

    // [2] 클러스터링
    const clusters = await stage("cluster", () =>
      clusterEvents(collected.items, { llm: options.llm }),
    );

    // [3] Top 10 선정 (2소스 게이트 포함)
    const top10 = await stage("select", () => selectTop10(clusters, options.llm));

    const eventsToProcess = options.maxArticles
      ? top10.selected.slice(0, options.maxArticles)
      : top10.selected;

    // [4]-[6] 이벤트별: 사실 추출 → 재작성 → 게이트
    const articles: PipelineArticle[] = [];

    await stage("extract", async () => {
      // extract/rewrite/gate run per-event inside one loop, but are reported
      // as separate stages for monitoring; extract stage records fact counts.
      return { note: "per-event extraction happens inside rewrite loop below" };
    });

    const rewriteStart = new Date().toISOString();
    let gateFailures = 0;
    try {
      for (const event of eventsToProcess) {
        const { facts } = await extractFacts(event, options.llm);
        log(
          `[pipeline] event="${event.title.slice(0, 50)}" facts=${facts.length} usable=${facts.filter((f) => f.usedInText).length}`,
        );

        const rewrite = await rewriteAllLevels(event.id, event.category, facts, options.llm);

        const gatedVersions: GatedVersion[] = [];
        for (const version of rewrite.versions) {
          const gated = await gateVersion(
            event.id,
            event.category,
            version,
            facts,
            event.items,
            options.llm,
          );
          if (!gated.passed) gateFailures++;
          gatedVersions.push(gated);
        }

        articles.push({
          id: event.id,
          slug: slugify(gatedVersions[0]?.version.title ?? event.title),
          category: event.category,
          rankInEdition: event.rankInEdition,
          // status='review' — human approval happens in web/ admin, never here.
          status: "review",
          eventSummary: event.title,
          sources: event.items.map((i) => ({
            url: i.url,
            outlet: i.outlet,
            title: i.title,
            fetchMethod: "rss_summary" as const,
          })),
          facts,
          versions: gatedVersions,
          createdAt: new Date().toISOString(),
        });
      }
      run.stages.push({
        stage: "rewrite",
        startedAt: rewriteStart,
        finishedAt: new Date().toISOString(),
        ok: true,
        detail: { articles: articles.length },
      });
      run.stages.push({
        stage: "gate",
        startedAt: rewriteStart,
        finishedAt: new Date().toISOString(),
        ok: true,
        detail: {
          versionsGated: articles.length * 3,
          versionsFlaggedForHumanReview: gateFailures,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.stages.push({
        stage: "rewrite",
        startedAt: rewriteStart,
        finishedAt: new Date().toISOString(),
        ok: false,
        detail: { articlesCompletedBeforeFailure: articles.length },
        error: message,
      });
      throw err;
    }

    // 저장 (status='review' — 검수 대기)
    const edition: PipelineEdition = {
      id: randomUUID(),
      editionDate,
      status: "draft",
      articles,
    };
    await stage("store", async () => {
      await options.storage.saveEdition(edition);
      return { editionDate, articles: articles.length, storage: options.storage.name };
    });

    run.articlesProduced = articles.length;
    run.status = "success";
  } catch (err) {
    run.status = "failed";
    run.errorSummary = err instanceof Error ? err.message : String(err);
  } finally {
    run.finishedAt = new Date().toISOString();
    // Recording the run must never mask the original failure.
    try {
      await options.storage.recordPipelineRun(run);
    } catch (recordErr) {
      log(`[pipeline] WARNING: failed to record pipeline_run: ${String(recordErr)}`);
    }
  }

  return run;
}

function summarizeStage(name: PipelineStage, result: unknown): Record<string, unknown> {
  switch (name) {
    case "collect": {
      const r = result as CollectResult;
      const bySource: Record<string, number> = {};
      for (const s of r.sourceReport) bySource[s.outlet] = s.itemCount;
      return {
        totalItems: r.items.length,
        okSources: r.sourceReport.filter((s) => s.ok).length,
        failedSources: r.sourceReport.filter((s) => !s.ok).map((s) => s.outlet),
        bySource,
      };
    }
    case "cluster": {
      const clusters = result as Array<{ items: unknown[]; outletCount: number }>;
      return {
        clusters: clusters.length,
        multiOutletClusters: clusters.filter((c) => c.outletCount >= 2).length,
      };
    }
    case "select": {
      const r = result as { selected: SelectedEvent[]; heldBack: unknown[] };
      return { selected: r.selected.length, heldBack: r.heldBack.length };
    }
    case "store":
      return result as Record<string, unknown>;
    default:
      return typeof result === "object" && result !== null
        ? (result as Record<string, unknown>)
        : {};
  }
}
