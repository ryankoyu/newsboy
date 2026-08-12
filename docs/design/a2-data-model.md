# A2 — 데이터 모델 설계 (Supabase / Postgres)

BRIEFLY — Version 0.1 / 2026-07-10 · **2026-08-11 실 스키마 대조 주석 추가**
작성: 데이터 모델 설계 에이전트 (A2)
입력 문서: [project-brief.md](../project-brief.md) (9장 기능, 16장 MVP) · [news-sourcing-strategy.md](../news-sourcing-strategy.md) (§2 재작성 원칙 — provenance) · [r3-pipeline-experiment.md](../research/r3-pipeline-experiment.md) (산출물 실물)

---

## ⚠️ 이 문서와 실제 스키마의 관계 (2026-08-11)

design-decisions.md §1-1은 이 문서를 "스키마의 단일 기준"으로 선언했지만, **실제로 DB에 적용되는 단일 기준은 `supabase/migrations/`다.** 마이그레이션 **5개**(`0001_schema.sql` · `0002_user_library.sql` · `0003_article_status_held.sql` · `0004_words_pos_and_categories_seed.sql` · `0005_pipeline_checkpoints.sql`, 2026-08-12 디스크 실측)가 순서대로 실행된 결과가 진짜 스키마이고, 이 문서의 §4 DDL 초안은 그중 `0001_schema.sql`의 밑그림에 해당한다.

아래 §4의 DDL과 실제 마이그레이션이 다른 지점을 표로 정리해 뒀다(표의 행 수가 곧 차이 건수다 — 예전 판이 적어 둔 "3곳"은 표가 늘어난 뒤에도 그대로였다). 스키마를 확인할 일이 있으면 **이 문서가 아니라 `supabase/migrations/`를 볼 것.**

| 항목 | 이 문서 §4 | 실제 (`supabase/migrations/`) |
|---|---|---|
| `article_status` | 6종 (`ingest`·`generated`·`review`·`approved`·`published`·`rejected`) | **7종** — `0003_article_status_held.sql`이 `review` 뒤에 **`held`** 추가 |
| `check_kind` | 2종 (`cefr`·`ngram_overlap`) | **5종** — `0001_schema.sql:13`이 `two_source`·`word_match`·**`word_count`** 포함 |
| `words` 컬럼 | **7개** — `id`·`version_id`·`term`·`meaning_ko`·`example`·`pronunciation`·`sort_order` (`pos`·`is_key` 없음) | **9개** — `0001_schema.sql:101-109`의 7개 + `0004`가 `is_key boolean not null default false`, `pos text`(nullable) 추가 |
| `categories` | 마스터 테이블 정의만 | `0004`가 시드 10행(world/korea/ai/tech/business/finance/science/sports/culture/lifestyle) 삽입 |
| `pipeline_checkpoints` | **없음** | `0005_pipeline_checkpoints.sql:22`이 신설 — 중단된 파이프라인 실행이 마지막 성공 단계부터 이어서 돌기 위한 단계 체크포인트 (2026-08-12 추가) |

> ⚠️ **2026-08-12 정정** — 위 `words` 행은 2026-08-11 판에 「6개 → 8개」로 적혀 있었다. 실제로는 이 문서 §4의 DDL이 **7개**, 마이그레이션 적용 결과가 **9개**다. 스키마 차이를 경고하려고 만든 표 자체가 양쪽 모두 하나씩 적게 세고 있었다 — 이 표를 근거로 삼기 전에 `supabase/migrations/`를 직접 볼 것.

---

## 0. 설계 철학 (한 줄씩)

- **1인 운영 서비스** → 과도한 정규화 금지. "나중에 필요할지 모르는" 테이블은 만들지 않는다. MVP에 실제로 쓰이는 것만.
- **MVP 우선, V2를 막지 않는다** → V2 기능(AI 대화·쉐도잉·복습·결제)은 지금 테이블을 만들지 않되, 기존 테이블에 컬럼/FK만 추가하면 붙도록 키 구조를 잡는다.
- **provenance는 타협 불가** → 2026-04-09 조작 사건 재발 방지가 이 서비스의 법적·윤리적 방어선이다(news-sourcing §2.5, 규칙 1). 사실→소스 추적을 DB에 물리적으로 저장한다. 이것만은 정규화한다.
- **공개 콘텐츠 vs 사용자 데이터를 RLS 경계로 명확히 가른다** → 콘텐츠는 anon도 읽기 가능, 사용자 데이터는 본인만.
- **운영 상태는 발행 콘텐츠와 분리** → 파이프라인 중간 산출물(검수 대기 등)이 사용자에게 새어 나가지 않도록 `status`로 게이트.

---

## 1. ERD 개요 (ASCII)

```
                        ┌─────────────────┐
                        │   categories    │  (World, AI, Business ...)
                        └────────┬────────┘
                                 │ 1
                                 │
                                 │ N
┌──────────────┐  1        N  ┌─▼──────────────┐
│   editions   │──────────────│    articles    │  사건 단위 기사
│ (그날 Top10) │              │  (event/story) │
└──────────────┘              └───┬─────┬──────┘
   1일 1행                        │1    │1
                          ┌───────┘     └───────────┐
                          │N                        │N
                  ┌───────▼────────┐        ┌────────▼────────┐
                  │ article_versions│       │     sources      │  참고 원문 URL
                  │  (A2/B1/B2)     │       │  (매체·수집시각) │
                  └───────┬─────────┘       └────────┬─────────┘
                          │                          │
             ┌────────────┼──────────┐               │
             │N           │N         │N              │
      ┌──────▼───┐ ┌──────▼───┐ ┌───▼──────┐         │
      │  words   │ │ quizzes  │ │  facts   │         │  기사의 사실 1건
      │          │ │(+options)│ │          │◄────────┤
      └──────────┘ └────┬─────┘ └────┬─────┘   N     │ M
                        │            │  fact_sources (provenance 연결표)
                  quiz_options       └──────────────► sources
                        │
             ═══════════╪═══════════════════════════════════════
             공개 콘텐츠 │ 사용자 데이터
             ═══════════╪═══════════════════════════════════════
                        │
   ┌────────────┐   ┌───▼────────────┐   ┌──────────────────┐
   │ auth.users │◄──│    profiles    │   │  reading_progress │
   │ (Supabase) │ 1:1│ (레벨·관심사) │   │  (읽음/완료)      │
   └─────┬──────┘   └────────────────┘   └──────────────────┘
         │ 1                                       │ user_id
         ├──────────────► saved_words (단어 저장)  │
         ├──────────────► bookmarks (기사 북마크)  │
         └──────────────► (V2: subscriptions 결제) ┘

   [파이프라인 운영]
   articles.status ─── ingest → generated → review → approved → published
                                         └→ held (게이트 미통과, 사람이 판단)  ※ 0003 에서 추가
   quality_checks (CEFR 점수·중복률 게이트 결과)  ── FK → article_versions
```

---

## 2. 테이블별 설명

### 공개 콘텐츠 (anon 읽기 가능)

| 테이블 | 역할 | 핵심 관계 |
|---|---|---|
| `categories` | 카테고리 마스터 (World, AI, Business, Korea, Sports…) | articles N:1 |
| `editions` | **일일 에디션** — 하루 1행. 그날의 Top 10 묶음(발행일, 상태). | articles N:1 |
| `articles` | **기사(사건 단위)** — 하나의 event. 레벨 무관 메타(제목slug·카테고리·에디션 내 순위·상태). | edition/category N:1, versions/sources/facts 1:N |
| `article_versions` | **기사 버전(A2/B1/B2)** — 레벨별 본문·제목·단어수. 기사당 3행. | article N:1, words/quizzes 1:N |
| `sources` | **소스** — 참고 원문 1건(URL·매체·제목·수집시각·fetch 방식). | article N:1, facts M:N |
| `facts` | **사실** — 기사에서 추출한 사실 1건(문장·확인 소스 수·게재 여부). | article N:1, sources M:N |
| `fact_sources` | **사실-소스 연결(provenance 핵심)** — 어떤 fact가 어떤 source에서 확인됐는지 M:N. `[search-summary only]` 여부 기록. | facts↔sources |
| `words` | **단어** — 단어·한국어 뜻·예문·발음 힌트. 버전(레벨)에 종속. | version N:1 |
| `quizzes` | **퀴즈 문항** — 질문·정답. | version N:1, options 1:N |
| `quiz_options` | 퀴즈 선택지 — 보기 텍스트·정답 여부. | quiz N:1 |
| `quality_checks` | **품질 게이트 결과** — CEFR 점수, n-gram 중복률, 통과 여부. | version N:1 |

### 사용자 데이터 (본인만)

| 테이블 | 역할 | 핵심 관계 |
|---|---|---|
| `profiles` | **프로필** — auth.users와 1:1. 레벨(A2/B1/B2)·관심사(카테고리 배열). | auth.users 1:1 |
| `reading_progress` | **학습 기록** — 사용자×기사 읽음/완료 상태·읽은 레벨. | user×article |
| `saved_words` | **저장한 단어** — 사용자가 사전에서 저장한 단어. | user×word |
| `bookmarks` | **북마크** — 사용자가 저장한 기사. | user×article |

---

## 3. 핵심 설계 결정 (이유 한 줄씩)

1. **`articles`(사건)와 `article_versions`(레벨)를 분리** — 하나의 사건이 A2/B1/B2 세 본문을 가진다. Level Switch(최대 차별점)가 곧 이 테이블 조회. 본문을 articles에 넣으면 레벨 컬럼이 3배로 늘어 지저분.
2. **본문은 `content` TEXT 한 컬럼에 통째로 저장** — 문장 단위 테이블로 쪼개지 않는다. Sentence Compare(V1.5)는 문장 배열을 JSONB로 저장하면 충분. 1인 운영에서 문장 테이블은 과잉.
3. **`facts` + `fact_sources` M:N은 유일하게 정규화한 곳** — r3의 "fact list (confirmed by 2+ sources)"를 그대로 DB화. provenance는 감사 대상이라 물리 저장이 안전. `[search-summary only]` 플래그로 load-bearing 여부 구분.
4. **`words`/`quizzes`를 article이 아니라 `article_versions`에 매단다** — r3에서 단어·퀴즈는 레벨별 텍스트에 딸려 나옴. 레벨마다 어휘 난이도가 다르므로 버전 종속이 자연스럽다. [추측] MVP에선 레벨별로 별도 생성 가정.
5. **`quiz_options`를 별도 테이블로** — 선택지 4개를 quizzes에 컬럼 4개(option_a~d)로 박으면 개수 고정·정답 표현이 지저분. 행으로 두면 유연.
6. **`editions`를 둔다** — "오늘의 Top 10"이 브랜드 자산. 발행 단위·발행일·에디션 상태를 한 행으로 관리하면 홈 화면 쿼리가 단순(`edition where date=today`).
7. **관심사를 배열 컬럼(`interests text[]`)으로** — 관심사×사용자 조인 테이블은 1인 운영에 과잉. Postgres 배열+GIN 인덱스로 충분.
8. **`status` enum으로 파이프라인 게이트** — 별도 워크플로 테이블 없이 articles/editions에 상태 컬럼. RLS가 `published`만 anon에 노출.
9. **V2 훅** — AI 대화는 `conversations(user_id, article_id, …)`, 쉐도잉은 `article_versions.audio_url` 컬럼, 복습은 `saved_words.review_due_at`, 결제는 `subscriptions(user_id, …)` + `profiles.plan`으로 **지금 구조를 안 바꾸고** 추가 가능. 그래서 지금은 안 만든다.

---

## 4. Postgres DDL 초안

```sql
-- =========================================================
-- ENUM 타입
-- =========================================================
create type cefr_level     as enum ('A2', 'B1', 'B2');
-- ⚠️ 실제 스키마는 아래와 다르다 — supabase/migrations/ 가 단일 기준. 문서 상단 대조표 참조.
create type article_status as enum ('ingest', 'generated', 'review', 'approved', 'published', 'rejected');
-- 실제: 'review' 뒤에 'held' 가 하나 더 있다 (0003_article_status_held.sql).
--       재작성 재시도를 다 쓰고도 2소스 게이트를 통과 못 한 기사. 'review' 와 같은
--       "사람이 본다" 종착지이되 왜 걸렸는지를 구분해 남긴다.
create type edition_status as enum ('draft', 'published');
create type check_kind     as enum ('cefr', 'ngram_overlap'); -- 품질 게이트 종류
-- 실제: 5종이다 (0001_schema.sql:13) —
--       ('cefr', 'ngram_overlap', 'two_source', 'word_match', 'word_count').
--       word_count 는 B2 분량 미달(feature-status G6) 대응으로 2026-07-17 추가.

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
  -- sentences jsonb,                          -- V1.5 Sentence Compare용 (문장 배열)
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
  -- ⚠️ 실제 스키마에는 컬럼 2개가 더 있다 (0004_words_pos_and_categories_seed.sql):
  --   is_key boolean not null default false  -- 루비 글로스로 본문 첫 등장에 표시할 핵심어
  --   pos    text                            -- 품사 'n.'|'v.'|'adj.'|'adv.'|'phrase' (nullable)
  -- 재작성 프롬프트가 두 값을 required 로 요구하는데 컬럼이 없어서, 돈 주고 뽑은 값을
  -- 저장 어댑터가 버리고 있었다. 이 컬럼 이전 단어는 pos 가 없고 백필하지 않는다(값을 만들지 않는다).
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
  kind        check_kind not null,             -- 실제: 'cefr' | 'ngram_overlap' | 'two_source' | 'word_match' | 'word_count'
  score       numeric,                         -- CEFR 점수 or 중복률(%)
  passed      boolean not null,
  detail      jsonb,                           -- 세부(초과 어휘 목록 등)
  checked_at  timestamptz not null default now()
);
create index on quality_checks (version_id);

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
```

---

## 5. Supabase RLS 기본 방침

원칙: **콘텐츠 테이블 = 발행분만 공개 읽기 / 사용자 테이블 = 본인 행만 CRUD / 쓰기·파이프라인 = service_role 전용.**

```sql
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
-- quizzes, quiz_options 도 동일 패턴 (생략 — 같은 EXISTS 조인)

-- facts / fact_sources / quality_checks: 내부 감사·운영 데이터.
--   → anon/authenticated 정책 없음 = service_role 만 접근 (RLS 기본 거부).
--   provenance를 대외 공개할지는 정책 결정 필요 (아래 8번).

-- (B) 사용자 데이터: 본인 행만
create policy "own profile"  on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own progress" on reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own saved"    on saved_words
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own bookmark" on bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**방침 요약**
- **콘텐츠 쓰기(INSERT/UPDATE)는 정책을 안 만든다** → 파이프라인은 `service_role` 키(RLS 우회)로만 씀. 일반 사용자는 콘텐츠를 못 고침.
- **`status != 'published'` 는 anon/authenticated에게 완전히 안 보임** → 검수 대기·거부된 기사가 새지 않음.
- **facts/fact_sources/quality_checks 는 RLS 정책을 안 붙임** → 기본 거부 = 내부(service_role) 전용. provenance는 감사용 원장.
- **profiles은 본인 것만** → 남의 레벨·관심사 못 봄.

---

## 6. V2 확장 훅 (지금은 안 만들지만 막지 않는다)

| V2 기능 | 확장 방법 (구조 변경 없음) |
|---|---|
| AI Conversation | `conversations(id, user_id, article_id, created_at)` + `messages(conversation_id, role, body)` 신규 테이블. 기존 articles FK만 참조. |
| Shadowing (TTS) | `article_versions.audio_url` 컬럼 추가 (문장별이면 sentences JSONB에 audio 키). |
| 복습 시스템 | `saved_words.review_due_at`, `review_interval` 컬럼 추가 (SRS 간격). |
| 관심사 큐레이션 | 이미 `profiles.interests[]` + `articles.category_id` 존재 → 쿼리만 짜면 됨. |
| Progress | `reading_progress` 집계 뷰로 충분. streak은 컬럼 추가. |
| 결제 | `profiles.plan` 컬럼 + `subscriptions(user_id, plan, status, period_end)` 신규 테이블. |

---

## 7. 미결·확인 필요 (메인 에이전트 결정)

1. **provenance 공개 범위** — fact_sources를 대외(출처 감사 페이지)로 열 것인가, 내부 감사용으로만 둘 것인가? [추측] MVP는 내부 전용 + 기사 하단 sources 링크만 공개가 안전. 변호사 자문 대상(news-sourcing §1 미결).
2. **단어/퀴즈의 레벨 종속** — 레벨마다 단어·퀴즈를 따로 생성할지(현 설계: version 종속), 사건 공통으로 둘지. r3는 레벨별로 제시했으나 실제 서비스 정책 미확정. [추측] 버전 종속으로 뒀음.
3. **본문 저장 형태** — content TEXT 통짜 vs sentences JSONB. Sentence Compare(V1.5)를 언제 붙일지에 따라 지금 JSONB로 갈지 결정 필요.

---

## 부록 — 인덱스·제약 요약

- 모든 FK에 `on delete cascade`(콘텐츠 하위) 또는 `set null`(에디션-기사) 지정 → 재생성 시 고아 방지.
- `articles.slug`, `editions.edition_date`, `article_versions(article_id, level)`, `saved_words(user_id, term)` = UNIQUE 제약으로 중복 발행/저장 방지.
- 조회 빈발 컬럼(version_id, article_id, user_id, interests GIN)에 인덱스.
- `status`/`level`은 enum → 오타·잘못된 상태값 원천 차단.
