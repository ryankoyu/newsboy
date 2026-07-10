-- =========================================================
-- BRIEFLY — Initial schema
-- Source: docs/design/a2-data-model.md §4 (DDL) + §5 (RLS)
--         + docs/design/design-decisions.md §1-2 (pipeline_runs addition)
-- =========================================================

-- =========================================================
-- ENUM 타입
-- =========================================================
create type cefr_level     as enum ('A2', 'B1', 'B2');
create type article_status as enum ('ingest', 'generated', 'review', 'approved', 'published', 'rejected');
create type edition_status as enum ('draft', 'published');
create type check_kind     as enum ('cefr', 'ngram_overlap', 'two_source', 'word_match'); -- 품질 게이트 종류

-- =========================================================
-- 공개 콘텐츠
-- =========================================================

-- 카테고리 마스터
create table categories (
  id          smallint generated always as identity primary key,
  slug        text not null unique,            -- 'world', 'ai', 'business'
  label       text not null,                   -- 'World', 'AI'
  emoji       text,                            -- '🌍'
  sort_order  smallint not null default 0
);

-- 일일 에디션 (그날의 Top 10)
create table editions (
  id            uuid primary key default gen_random_uuid(),
  edition_date  date not null unique,          -- 하루 1행
  status        edition_status not null default 'draft',
  published_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- 기사 (사건 단위)
create table articles (
  id            uuid primary key default gen_random_uuid(),
  edition_id    uuid references editions(id) on delete set null,
  category_id   smallint references categories(id),
  slug          text not null unique,          -- URL용
  event_summary text,                          -- 내부용 사건 한줄 요약 (비공개)
  rank_in_edition smallint,                    -- Top 10 내 순위 1~10
  status        article_status not null default 'ingest',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 기사 버전 (A2 / B1 / B2)
create table article_versions (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references articles(id) on delete cascade,
  level       cefr_level not null,
  title       text not null,                   -- 레벨별 새로 쓴 제목
  content     text not null,                   -- 재작성 본문 (통째로)
  word_count  int,
  sentences   jsonb not null default '[]',      -- 문장 단위 배열 (design-decisions.md §2-3, §4.6:
                                                  --   단어 클릭·문장 비교 V1.5·쉐도잉 V2가 전부
                                                  --   문장 단위 인터랙션이라 활성화)
  -- audio_url text,                           -- V1.5 Shadowing TTS용
  created_at  timestamptz not null default now(),
  unique (article_id, level)                   -- 기사당 레벨 1개
);

-- 소스 (참고 원문)
create table sources (
  id           uuid primary key default gen_random_uuid(),
  article_id   uuid not null references articles(id) on delete cascade,
  url          text not null,
  outlet       text,                           -- 'Yahoo Finance', 'ESPN'
  title        text,
  fetched_at   timestamptz not null default now(),
  fetch_method text,                           -- 'full_text' | 'search_summary'
  created_at   timestamptz not null default now()
);
create index on sources (article_id);

-- 사실 (기사에서 추출한 사실 1건)
create table facts (
  id            uuid primary key default gen_random_uuid(),
  article_id    uuid not null references articles(id) on delete cascade,
  statement     text not null,                 -- "Meta laid off about 8,000 employees."
  source_count  smallint not null default 0,   -- 확인된 독립 소스 수 (2+ 규칙 검사용)
  used_in_text  boolean not null default true, -- 학습 본문에 실제 사용됐는가
  note          text,                          -- 'single source, softened' 등
  created_at    timestamptz not null default now()
);
create index on facts (article_id);

-- 사실-소스 연결 (provenance 핵심 M:N)
create table fact_sources (
  fact_id            uuid not null references facts(id) on delete cascade,
  source_id          uuid not null references sources(id) on delete cascade,
  search_summary_only boolean not null default false, -- [search-summary only] 태그
  primary key (fact_id, source_id)
);

-- 단어 (버전 종속)
create table words (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references article_versions(id) on delete cascade,
  term          text not null,                 -- 'lay off'
  meaning_ko    text not null,                 -- '(경영상) 해고하다'
  example       text,                          -- 예문
  pronunciation text,                          -- 'LAY-off'
  sort_order    smallint not null default 0
);
create index on words (version_id);

-- 퀴즈 문항 (버전 종속)
create table quizzes (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references article_versions(id) on delete cascade,
  question    text not null,
  sort_order  smallint not null default 0
);
create index on quizzes (version_id);

-- 퀴즈 선택지
create table quiz_options (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references quizzes(id) on delete cascade,
  body        text not null,                   -- 보기 텍스트
  is_correct  boolean not null default false,
  sort_order  smallint not null default 0
);
create index on quiz_options (quiz_id);

-- 품질 게이트 결과 (CEFR 점수·중복률)
create table quality_checks (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references article_versions(id) on delete cascade,
  kind        check_kind not null,             -- 'cefr' | 'ngram_overlap' | 'two_source' | 'word_match'
  score       numeric,                         -- CEFR 점수 or 중복률(%)
  passed      boolean not null,
  detail      jsonb,                           -- 세부(초과 어휘 목록 등)
  checked_at  timestamptz not null default now()
);
create index on quality_checks (version_id);

-- =========================================================
-- 파이프라인 운영 (design-decisions.md §1-2)
-- =========================================================

-- 일일 파이프라인 실행 기록 (모니터링용, 단순화된 버전)
create table pipeline_runs (
  id          uuid primary key default gen_random_uuid(),
  run_date    date not null,                   -- 실행 대상 날짜 (에디션 날짜와 대응)
  stage       text not null,                   -- 'ingest' | 'cluster' | 'select' | 'extract' | 'rewrite' | 'gate' | 'publish' 등
  status      text not null default 'running', -- 'running' | 'success' | 'failed'
  error       text,                            -- 실패 시 에러 메시지
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index on pipeline_runs (run_date);

-- =========================================================
-- 사용자 데이터
-- =========================================================

-- 프로필 (auth.users 1:1)
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  level      cefr_level not null default 'A2', -- 온보딩 레벨 선택
  interests  text[] not null default '{}',     -- 관심 카테고리 slug 배열
  -- plan     text not null default 'free',    -- V2 결제용
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on profiles using gin (interests);

-- 학습 기록 (읽음/완료)
create table reading_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  article_id  uuid not null references articles(id) on delete cascade,
  read_level  cefr_level,                      -- 어느 레벨로 읽었나
  completed   boolean not null default false,  -- 완독 여부
  read_at     timestamptz not null default now(),
  primary key (user_id, article_id)
);

-- 저장한 단어
create table saved_words (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  word_id     uuid references words(id) on delete set null,
  term        text not null,                   -- word 삭제돼도 남도록 스냅샷
  meaning_ko  text,
  -- review_due_at timestamptz,                -- V1.5 복습 시스템용
  created_at  timestamptz not null default now(),
  unique (user_id, term)
);
create index on saved_words (user_id);

-- 북마크
create table bookmarks (
  user_id     uuid not null references auth.users(id) on delete cascade,
  article_id  uuid not null references articles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, article_id)
);

-- =========================================================
-- Supabase RLS 정책 (A2 §5)
-- 원칙: 콘텐츠 테이블 = 발행분만 공개 읽기 / 사용자 테이블 = 본인 행만 CRUD /
--       쓰기·파이프라인 = service_role 전용.
-- =========================================================

-- 모든 테이블 RLS 켜기
alter table categories        enable row level security;
alter table editions          enable row level security;
alter table articles          enable row level security;
alter table article_versions  enable row level security;
alter table sources           enable row level security;
alter table facts             enable row level security;
alter table fact_sources      enable row level security;
alter table words             enable row level security;
alter table quizzes           enable row level security;
alter table quiz_options      enable row level security;
alter table quality_checks    enable row level security;
alter table profiles          enable row level security;
alter table reading_progress  enable row level security;
alter table saved_words       enable row level security;
alter table bookmarks         enable row level security;
alter table pipeline_runs     enable row level security;

-- (A) 공개 콘텐츠: 발행된 것만 anon/authenticated 읽기 가능
create policy "read published articles" on articles
  for select using (status = 'published');

create policy "read published versions" on article_versions
  for select using (
    exists (select 1 from articles a
            where a.id = article_versions.article_id and a.status = 'published')
  );

-- categories 는 전부 공개
create policy "read categories" on categories for select using (true);
-- editions: published 만
create policy "read published editions" on editions
  for select using (status = 'published');

-- sources: 출처 표기(하단 링크)는 공개해야 하므로 발행 기사분만 읽기 허용
create policy "read sources of published" on sources
  for select using (
    exists (select 1 from articles a
            where a.id = sources.article_id and a.status = 'published')
  );

-- words / quizzes / quiz_options: 발행 기사 버전에 딸린 것만 읽기
create policy "read words of published" on words
  for select using (
    exists (select 1 from article_versions v join articles a on a.id = v.article_id
            where v.id = words.version_id and a.status = 'published')
  );

create policy "read quizzes of published" on quizzes
  for select using (
    exists (select 1 from article_versions v join articles a on a.id = v.article_id
            where v.id = quizzes.version_id and a.status = 'published')
  );

create policy "read quiz_options of published" on quiz_options
  for select using (
    exists (select 1 from quizzes q
            join article_versions v on v.id = q.version_id
            join articles a on a.id = v.article_id
            where q.id = quiz_options.quiz_id and a.status = 'published')
  );

-- facts / fact_sources / quality_checks / pipeline_runs: 내부 감사·운영 데이터.
--   → anon/authenticated 정책 없음 = service_role 만 접근 (RLS 기본 거부).
--   provenance를 대외 공개할지는 정책 결정 필요 (A2 §7-1, 변호사 자문 대상).

-- (B) 사용자 데이터: 본인 행만
create policy "own profile"  on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own progress" on reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own saved"    on saved_words
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own bookmark" on bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
