/**
 * Monorepo filesystem paths — server-only.
 *
 * A1 architecture (docs/design/a1-architecture.md §"로컬 모드 우선", production
 * readiness §2): Supabase isn't connected yet, so the admin review console
 * reads/writes the pipeline's own output files directly instead of a DB.
 * Centralizing the path here means the eventual Supabase swap only touches
 * `web/src/lib/admin/localFsEditionRepository.ts` (behind the
 * EditionRepository interface), not every call site.
 *
 * Resolution: `process.cwd()` is the reliable "project root" for Next.js
 * server-side code at runtime (route handlers / Server Actions / server
 * components) — unlike `import.meta.url`, it isn't affected by how the
 * bundler relocates compiled output. This assumes the web app is started
 * from the `web/` directory (true for `npm run dev` / `npm run build` run
 * inside `web/`, which is how this repo's scripts are invoked).
 *
 * `PIPELINE_OUTPUT_DIR` env var overrides the default for anyone whose
 * working directory layout differs (e.g. CI running from repo root).
 */
import path from "node:path";

function resolvePipelineOutputDir(): string {
  const override = process.env.PIPELINE_OUTPUT_DIR;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.resolve(process.cwd(), "..", "pipeline", "output");
}

export const PIPELINE_OUTPUT_DIR = resolvePipelineOutputDir();
export const PIPELINE_EDITIONS_DIR = path.join(PIPELINE_OUTPUT_DIR, "editions");

/** e.g. pipeline/output/selection-report-2026-07-13.json (optional, best-effort). */
export function selectionReportPath(editionDate: string): string {
  return path.join(PIPELINE_OUTPUT_DIR, `selection-report-${editionDate}.json`);
}

export function editionFilePath(editionDate: string): string {
  return path.join(PIPELINE_EDITIONS_DIR, `${editionDate}.json`);
}

/** web app's own seed data directory — publish writes here. */
export const WEB_SEED_DIR = path.resolve(process.cwd(), "src", "lib", "data", "seed");
