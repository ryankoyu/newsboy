-- =========================================================
-- BRIEFLY — pipeline_checkpoints (단계 체크포인트를 러너 밖으로)
-- Source: docs/design/a1-architecture.md §1.3 ("단계별로 쪼개 실행하고 각
--         단계 결과를 커밋 — 중단돼도 이어서 재개") + §2 ("각 단계는 성공
--         지점을 체크포인트로 남기고 끝난다")
--         + pipeline/src/storage/adapter.ts saveCheckpoint/load/clear
-- =========================================================

-- 설계는 "각 단계는 DB에 상태를 남긴다"였는데 구현은 러너 로컬 JSON 파일
-- (pipeline/output/checkpoints/<날짜>.json)이었다. 로컬 실행에서는 같은
-- 얘기지만 §6이 고른 실행 환경(GitHub Actions)은 임시 러너라, job 이 죽고
-- 다시 dispatch 되면 파일이 통째로 사라진다 — 즉 "어느 단계에서 죽어도
-- 재개한다"가 정작 운영 환경에서만 성립하지 않았다. 재개가 지켜 주려던
-- 것은 이미 돈을 치른 Opus 재작성분이므로(1회 약 $1.04), 체크포인트는
-- 러너 밖에 있어야 한다.
--
-- 이 표는 콘텐츠가 아니라 실행 스크래치다. 사람이 읽지 않고, 에디션이
-- 저장되는 순간 삭제되며, 잃어도 비용(재실행)만 들 뿐 정확성은 다치지
-- 않는다. 그래서 단계별 컬럼으로 쪼개지 않고 PipelineCheckpoint 를 통째로
-- jsonb 한 칸에 넣는다 — 단계가 늘 때마다 마이그레이션을 새로 쓰지 않기
-- 위해서다. 스키마의 권위는 pipeline/src/types.ts 의 PipelineCheckpoint 다.
create table pipeline_checkpoints (
  -- 에디션 날짜당 1행. 재개의 단위가 "그날의 에디션"이라 자연키가 곧 PK다
  -- (같은 날짜 재실행은 앞 실행의 행을 덮어쓴다 — upsert on conflict).
  edition_date date primary key,

  -- 마지막으로 이 행을 쓴 실행. uuid 가 아니라 text 인 이유: 이 값은
  -- PipelineCheckpoint.runId 주석대로 "추적용이지 대조용이 아니다".
  -- 형식이 달라졌다고 체크포인트 쓰기가 실패하면, 추적하려던 값 때문에
  -- 지키려던 재작성분을 잃는다.
  run_id       text not null,

  -- PipelineCheckpoint 전체(collect/cluster/select/extract/articles).
  -- 원문 본문을 포함해 수 MB까지 커진다 — Postgres 는 TOAST 로 압축해
  -- 넣으므로 문제되지 않지만, 무료 티어 용량을 갉아먹지 않도록 어댑터가
  -- 재개 유효기간이 지난 행을 실행 시작 때 지운다
  -- (storage/supabase.ts loadCheckpoint, CHECKPOINT_MAX_AGE_HOURS).
  payload      jsonb not null,

  -- run.ts 가 재개 여부를 판단하는 나이. payload 안의 updatedAt 과 같은
  -- 값을 밖으로 꺼내 둔 것 — 대시보드에서 눈으로 보고, 만료 행 삭제를
  -- 인덱스로 처리하기 위해서다.
  updated_at   timestamptz not null default now()
);

-- 만료 행 정리(updated_at < 기준시각)용. 행 수는 하루 1개 수준이라 성능
-- 때문이 아니라, 삭제가 payload 를 스캔하지 않게 하려는 것이다.
create index on pipeline_checkpoints (updated_at);

-- facts / pipeline_runs 와 같은 내부 운영 데이터다.
-- anon/authenticated 정책 없음 = service_role 만 접근 (RLS 기본 거부).
-- 원문 전문이 들어 있으므로 여기에 읽기 정책을 여는 것은
-- news-sourcing-strategy §1(원문 재배포 금지)에 걸린다.
alter table pipeline_checkpoints enable row level security;
