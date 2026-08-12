-- =========================================================
-- BRIEFLY — article_status 에 'held' 추가
-- Source: pipeline/src/pipeline/run.ts articleStatusForGatedVersions()
--         + pipeline/src/types.ts ArticleStatus
--         + news-sourcing-strategy.md §2 rule #2 (2소스 규칙)
--
-- 왜 별도 마이그레이션인가: Postgres 는 같은 트랜잭션 안에서 방금 추가한
-- enum 값을 사용하지 못한다. 이후 마이그레이션(0004)이 쓰기 작업을 하므로
-- enum 확장만 따로 떼어 놓는다.
-- =========================================================

-- 재작성 재시도를 다 쓰고도 2소스 게이트를 통과하지 못한 기사.
-- run.ts 는 이 값을 반환하는데 enum 에는 없어서, 실제로 발생하는 순간
-- 저장 어댑터가 첫 기사를 쓰기도 전에 던지고 그 실행분이 통째로 사라졌다.
-- 'review' 와 같은 "사람이 본다" 종착지이되, 왜 걸렸는지를 구분해 남긴다.
alter type article_status add value if not exists 'held' after 'review';
