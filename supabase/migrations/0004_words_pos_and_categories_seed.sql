-- =========================================================
-- BRIEFLY — words.is_key / words.pos 컬럼 + categories 시드
-- Source: docs/feature-status.md G9 (품사 표기) / design-decisions.md §4.8-3
--         + a2-data-model.md §4 (categories 는 마스터 시드 테이블)
-- =========================================================

-- ---------------------------------------------------------
-- 1) words: is_key / pos
--
-- 재작성 프롬프트(pipeline/src/llm/prompts.ts)는 두 필드를 required 로
-- 요구하고, 파이프라인 타입(WordEntry)과 웹 타입(web/src/lib/types.ts)에도
-- 이미 들어 있다. 시드 JSON 경로는 값을 보존하는데 Supabase 스키마에만
-- 컬럼이 없어서, 돈 주고 뽑은 값을 저장 어댑터가 버리고 있었다.
-- ---------------------------------------------------------

-- design-decisions.md §4.8-3/4: 레벨을 맞추려고 피하지 않고 일부러 남긴
-- "어렵지만 꼭 필요한" 단어. 웹에서 본문 첫 등장 위치에 루비 글로스로 표시.
-- not null default false — 기존 행은 "핵심어 아님"이 사실에 부합한다
-- (지어내지 않기: 값이 없던 행에 true 를 채우지 않는다).
alter table words add column if not exists is_key boolean not null default false;

-- docs/feature-status.md G9 / a3-ui-ux.md §2-3 — 'n.' | 'v.' | 'adj.' |
-- 'adv.' | 'phrase' 약어. nullable: 이 컬럼 이전에 생성된 단어에는 품사가
-- 없고 백필하지 않는다(값을 만들어내지 않는다). 웹은 있으면 보여주고
-- 없으면 생략한다.
alter table words add column if not exists pos text;

-- ---------------------------------------------------------
-- 2) categories 시드
--
-- 테이블이 비어 있어서 저장 어댑터가 category_id 에 null 을 하드코딩하고
-- 있었다. 목록·id 는 web/src/lib/data/seed/categories.json 을 그대로 옮긴
-- 것이다 — 시드 JSON 과 DB 가 서로 다른 id 를 쓰면 두 경로로 만들어진
-- 데이터가 섞이는 순간 카테고리가 뒤바뀐다.
--
-- id 는 `generated always as identity` 라 명시 지정에 overriding system
-- value 가 필요하다. categories 는 런타임에 행이 늘지 않는 마스터 시드라
-- 이 방식이 안전하고, 뒤에서 identity 를 11 부터로 맞춰 두어 나중에
-- 자동 채번으로 한 행을 추가해도 충돌하지 않게 한다.
--
-- 파이프라인의 5분류(world/korea/ai-tech/business/culture-sports)는 이
-- 목록의 부분집합으로 매핑된다 — 매핑표는
-- pipeline/src/storage/supabase.ts 와 web/src/lib/admin/seedTransform.ts
-- 양쪽에 같은 내용으로 있다.
-- ---------------------------------------------------------
insert into categories (id, slug, label, emoji, sort_order)
overriding system value
values
  (1,  'world',     'World',      '🌍', 1),
  (2,  'korea',     'Korea',      '🇰🇷', 2),
  (3,  'ai',        'AI',         '🤖', 3),
  (4,  'tech',      'Technology', '💻', 4),
  (5,  'business',  'Business',   '💼', 5),
  (6,  'finance',   'Finance',    '💰', 6),
  (7,  'science',   'Science',    '🔬', 7),
  (8,  'sports',    'Sports',     '⚽', 8),
  (9,  'culture',   'Culture',    '🎭', 9),
  (10, 'lifestyle', 'Lifestyle',  '🌿', 10)
on conflict do nothing;

-- 시드가 쓴 1~10 다음부터 자동 채번되도록.
alter table categories alter column id restart with 11;
