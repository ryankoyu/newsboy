-- =========================================================
-- Newsboy — 검수 결정을 DB에 (운영자 콘솔의 Supabase 이전)
-- Source: web/src/lib/admin/editionRepository.ts · pipelineTypes.ts
-- =========================================================
--
-- 왜 필요한가
--   검수 콘솔(/admin)은 지금 운영자 컴퓨터의 pipeline/output/*.json 을 직접
--   읽고 고친다. 그 폴더는 gitignore 대상이라 배포된 서버에는 존재하지 않고,
--   그래서 배포해도 검수 화면은 안내문만 띄운다. 파이프라인은 DB에 쓰고,
--   웹은 DB를 읽는데, 그 둘을 잇는 사람의 판단만 로컬 파일에 남아 있었다.
--
--   콘솔이 쓰는 값들 — 승인/제외/반려, 제외 사유, 반려 지시문, 리드 기사 —
--   은 파이프라인 타입에 "console-written, additive" 로 표시돼 있고 로컬
--   JSON 에는 그냥 얹혀 있었다. DB 에는 담을 칸이 없다. 이 마이그레이션이
--   그 칸을 만든다.
--
-- status 와 무엇이 다른가
--   articles.status 는 파이프라인이 남기는 것이다 — 게이트를 통과했는가
--   (review), 2소스 검증에 걸렸는가(held). review_decision 은 사람이 남기는
--   것이다 — 내보낼 것인가(approved), 뺄 것인가(excluded), 다시 쓰게 할
--   것인가(regenerate). 둘은 서로를 대체하지 않는다: held 인 기사를 승인할
--   수 없다는 규칙 자체가 두 값을 동시에 봐야 성립한다.
--
--   그래서 status 에 값을 더 넣지 않고 열을 따로 둔다. 하나로 합치면 "게이트가
--   막았다"와 "사람이 뺐다"가 같은 칸에서 서로를 덮어쓴다.

-- ---------------------------------------------------------
-- 1) 기사별 운영자 결정
-- ---------------------------------------------------------

-- pending 은 "아직 안 봤다"이지 "보류"가 아니다. 기본값이 곧 초기 상태이므로
-- 기존 행도 전부 pending 으로 시작한다 — 사실에 부합한다(아무도 결정한 적 없다).
create type review_decision as enum ('pending', 'approved', 'excluded', 'regenerate');

alter table articles
  add column if not exists review_decision review_decision not null default 'pending',
  -- 제외 사유. 콘솔이 필수로 받는다(왜 뺐는지 없는 제외는 나중에 아무도 못 읽는다).
  add column if not exists exclude_reason text,
  -- 반려 지시문. 이 문장은 재작성 프롬프트에 그대로 실려 모델에게 전달된다
  -- (pipeline/src/pipeline/regenerate.ts). 빈 값이면 지시 없는 재작성이 되므로
  -- 콘솔이 필수로 받는다.
  add column if not exists regenerate_note text,
  add column if not exists regenerate_requested_at timestamptz,
  -- 같은 기사를 몇 번 다시 쓰게 했는지. 무한 재작성을 사람이 알아채는 유일한 신호다.
  add column if not exists regeneration_count smallint not null default 0,
  add column if not exists regenerated_at timestamptz;

-- ---------------------------------------------------------
-- 2) 리드 기사 (에디션당 하나)
-- ---------------------------------------------------------
--
-- 홈 화면 맨 위에 무엇을 둘지를 운영자가 고른 결과. 고르지 않으면 null 이고,
-- 그때는 순위 1번이 리드가 된다(웹 쪽 기본 동작).
--
-- on delete set null: 리드로 지정된 기사가 지워지면 지정도 사라져야 한다.
-- 파이프라인은 에디션을 다시 만들 때 기사를 지우고 다시 넣으므로(replace 전략,
-- storage/supabase.ts 헤더) 이 경우는 가정이 아니라 일상이다.
alter table editions
  add column if not exists lead_article_id uuid references articles(id) on delete set null;

-- ---------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------
--
-- 새 열에 대한 정책은 만들지 않는다. 0001 의 정책은 행 단위이고, 이 열들은
-- 이미 정책이 걸린 표에 붙었다 — 발행된 기사는 anon 이 읽고, 쓰기는 여전히
-- service_role 만 가능하다. 검수 콘솔은 운영자 컴퓨터에서 service_role 키로
-- 동작하므로(0006 과 같은 이유) 별도 권한이 필요 없다.
--
-- 주의: 그래서 review_decision 과 exclude_reason 은 발행된 기사에 한해
-- anon 키로도 읽힌다. 여기에 독자가 봐서는 안 될 것을 적지 말 것 — 이 칸은
-- 편집 판단이지 비공개 메모가 아니다.
