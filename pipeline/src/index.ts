/**
 * BRIEFLY daily content pipeline — entry point stub.
 *
 * This is a scaffold only. The pipeline team implements the 8-stage flow
 * defined in docs/design/a1-architecture.md §2:
 *
 *   [1] RSS 수집 (ingest)
 *   [2] 사건 클러스터링 (cluster)
 *   [3] Top 10 선정 (select)
 *   [4] 사실(Fact) 추출 (extract)
 *   [5] 레벨별 재작성 A2/B1/B2 (rewrite)
 *   [6] 품질 게이트 — CEFR / n-gram / 2-source (gate)
 *   [7] 사람 최종 승인 (review — handled in web/ admin screen, not here)
 *   [8] 발행 (publish — status flip only, triggered post-approval)
 *
 * Each run should write one row to `pipeline_runs` (see
 * supabase/migrations/0001_schema.sql) per stage, so failures can resume
 * from the last successful stage (A1 §1.3, §2 failure table).
 *
 * Intended execution environment: GitHub Actions, once daily
 * (design-decisions.md §3-1).
 */

async function main(): Promise<void> {
  console.log("[pipeline] scaffold only — no stages implemented yet.");
}

main().catch((err) => {
  console.error("[pipeline] fatal error", err);
  process.exitCode = 1;
});
