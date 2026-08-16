/**
 * Publish orchestration: approved articles -> web seed JSON (production-
 * readiness.md §2 "에디션 발행 버튼"). Enforces the a1-architecture.md §2
 * [7] rule that nothing reaches the public seed without an explicit
 * operator approval ("승인 없이 발행 불가").
 *
 * Upsert semantics: rows are scoped by this edition's deterministic id
 * prefixes (article-<date>-*, version-<date>-*, ...) and fully replaced on
 * every publish — so re-publishing after changing a decision, or excluding
 * a previously-approved article, cleans up stale rows instead of
 * accumulating them. Other editions' rows (e.g. an earlier published date)
 * are left untouched, so multiple editions can coexist in the seed/archive.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { WEB_SEED_DIR } from "@/lib/config/paths";
import { deriveGateStatus } from "./gateStatus";
import { buildSeedBundle, type SeedRow } from "./seedTransform";
import { resolveEditionRepository } from "./editionRepository";
import type { EditionRepository } from "./editionRepository";
import {
  isSupabasePublishConfigured,
  publishEditionToSupabase,
  type SupabasePublishResult,
} from "./publishToSupabase";

async function readJson<T>(fileName: string): Promise<T> {
  const raw = await readFile(path.join(WEB_SEED_DIR, fileName), "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJson(fileName: string, data: unknown): Promise<void> {
  await writeFile(path.join(WEB_SEED_DIR, fileName), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

const idHasPrefix = (row: SeedRow, key: string, prefix: string) =>
  typeof row[key] === "string" && (row[key] as string).startsWith(prefix);

export interface PublishResult {
  editionDate: string;
  publishedAt: string;
  approvedCount: number;
  excludedCount: number;
  warnings: string[];
  /**
   * What reached readers. Null when Supabase is not configured — in that
   * case publishing wrote the seed only, and the deployed site will not
   * change until someone commits it.
   */
  supabase: SupabasePublishResult | null;
}

export class PublishError extends Error {}

export async function publishEdition(
  editionDate: string,
  repo: EditionRepository = resolveEditionRepository()
): Promise<PublishResult> {
  const edition = await repo.getEdition(editionDate);
  if (!edition) throw new PublishError(`Edition not found: ${editionDate}`);

  const approved = edition.articles.filter((a) => a.reviewDecision === "approved");
  if (approved.length === 0) {
    throw new PublishError(
      "승인된 기사가 없습니다. 최소 1건 이상 승인해야 발행할 수 있습니다."
    );
  }
  const stillHeld = approved.filter((a) => deriveGateStatus(a).status === "held");
  if (stillHeld.length > 0) {
    throw new PublishError(
      `보류(held) 상태인 기사가 승인되어 있습니다: ${stillHeld.map((a) => a.id).join(", ")}`
    );
  }

  // A 반려 that the pipeline hasn't answered yet is not an exclusion — the
  // operator asked for a rewrite, not for the story to be dropped. Publishing
  // now ships the edition without it, so say so rather than let an edition of
  // nine go out looking like an edition of ten.
  const awaitingRegeneration = edition.articles.filter(
    (a) => a.reviewDecision === "regenerate"
  );

  const publishedAt = new Date().toISOString();

  // Supabase first. It is the path readers are actually served from when the
  // site is deployed, and it is the step that can fail for reasons outside
  // this machine (network, credentials, an edition the pipeline stored
  // locally instead). Doing it first means a failure leaves the seed
  // untouched and the operator sees an error, rather than a "published"
  // message and a site that did not change.
  //
  // Skipped entirely when Supabase is not configured, so a contributor with
  // only a clone can still publish into the seed and see it work.
  let supabase: SupabasePublishResult | null = null;
  if (isSupabasePublishConfigured()) {
    supabase = await publishEditionToSupabase(
      editionDate,
      approved.map((a) => a.id)
    );
  }

  const categories = await readJson<Array<{ id: number; slug: string }>>("categories.json");
  const categoryIdBySlug = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const bundle = buildSeedBundle(edition, categoryIdBySlug, publishedAt);

  const articlePrefix = `article-${editionDate}-`;
  const versionPrefix = `version-${editionDate}-`;
  const factPrefix = `fact-${editionDate}-`;
  const editionId = `edition-${editionDate}`;

  const [articles, articleVersions, words, facts, sources, factSources, editions] =
    await Promise.all([
      readJson<SeedRow[]>("articles.json"),
      readJson<SeedRow[]>("article_versions.json"),
      readJson<SeedRow[]>("words.json"),
      readJson<SeedRow[]>("facts.json"),
      readJson<SeedRow[]>("sources.json"),
      readJson<SeedRow[]>("fact_sources.json"),
      readJson<SeedRow[]>("editions.json"),
    ]);

  const nextArticles = [
    ...articles.filter((r) => r.edition_id !== editionId),
    ...bundle.articles,
  ];
  const nextVersions = [
    ...articleVersions.filter((r) => !idHasPrefix(r, "article_id", articlePrefix)),
    ...bundle.article_versions,
  ];
  const nextWords = [
    ...words.filter((r) => !idHasPrefix(r, "version_id", versionPrefix)),
    ...bundle.words,
  ];
  const nextFacts = [
    ...facts.filter((r) => !idHasPrefix(r, "article_id", articlePrefix)),
    ...bundle.facts,
  ];
  const nextSources = [
    ...sources.filter((r) => !idHasPrefix(r, "article_id", articlePrefix)),
    ...bundle.sources,
  ];
  const nextFactSources = [
    ...factSources.filter((r) => !idHasPrefix(r, "fact_id", factPrefix)),
    ...bundle.fact_sources,
  ];
  const nextEditions = [...editions.filter((r) => r.id !== editionId), bundle.edition];

  await Promise.all([
    writeJson("articles.json", nextArticles),
    writeJson("article_versions.json", nextVersions),
    writeJson("words.json", nextWords),
    writeJson("facts.json", nextFacts),
    writeJson("sources.json", nextSources),
    writeJson("fact_sources.json", nextFactSources),
    writeJson("editions.json", nextEditions),
  ]);

  await repo.setEditionStatus(editionDate, "published", publishedAt);

  return {
    editionDate,
    publishedAt,
    approvedCount: approved.length,
    excludedCount: edition.articles.filter((a) => a.reviewDecision === "excluded").length,
    warnings: [
      ...bundle.warnings,
      ...(awaitingRegeneration.length > 0
        ? [
            `재생성 요청 대기 ${awaitingRegeneration.length}건은 이번 발행에 포함되지 않았습니다 ` +
              `(#${awaitingRegeneration.map((a) => a.rankInEdition).join(", #")}). ` +
              "파이프라인에서 재생성한 뒤 다시 발행하면 반영됩니다.",
          ]
        : []),
      // Without this, a publish that only touched local files reads exactly
      // like one that reached readers.
      ...(supabase === null
        ? [
            "Supabase 자격 정보가 없어 시드 파일만 갱신했습니다 — " +
              "배포된 사이트는 이 변경을 커밋·푸시해야 반영됩니다.",
          ]
        : []),
      ...(supabase && supabase.withdrawnCount > 0
        ? [`이전에 발행됐던 기사 ${supabase.withdrawnCount}건을 독자 화면에서 내렸습니다.`]
        : []),
    ],
    supabase,
  };
}
