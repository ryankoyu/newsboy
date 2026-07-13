-- =========================================================
-- BRIEFLY — User library extension (saved sentences)
-- Source: docs/design/design-decisions.md §4.7 (2026-07-13)
--         "문장 저장" — SessionStore(localStorage) 확장분의 Supabase 대응.
--         0001_schema.sql 은 수정하지 않는다 (신규 마이그레이션으로 추가).
-- =========================================================

-- 저장한 문장 (My 페이지 "문장" 서랍)
create table saved_sentences (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  article_version_id uuid not null references article_versions(id) on delete cascade,
  sentence_index     smallint not null,          -- article_versions.sentences 배열 내 인덱스
  text_snapshot      text not null,               -- 저장 시점 문장 텍스트 스냅샷 (본문 수정에도 남도록)
  created_at         timestamptz not null default now(),
  unique (user_id, article_version_id, sentence_index)
);
create index on saved_sentences (user_id);
create index on saved_sentences (article_version_id);

-- RLS: 본인 행만 (0001_schema.sql §(B) 사용자 데이터 원칙과 동일)
alter table saved_sentences enable row level security;

create policy "own saved sentence" on saved_sentences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
