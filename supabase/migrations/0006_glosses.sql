-- =========================================================
-- Newsboy — glosses: 본문의 모든 단어에 대한 사전 뜻
-- Source: pipeline/src/pipeline/glossary.ts
-- =========================================================
--
-- 왜 필요한가
--   독자는 기사 본문의 아무 단어나 눌러볼 수 있는데(design-decisions.md
--   §4.8-1), 뜻이 붙어 있는 것은 레벨당 5개뿐이었다. B2 기사가 450~520
--   단어이니 나머지 ~495개는 "뜻 준비 중" 카드만 떴고, 그 카드는 나중에
--   사전이 채워질 것처럼 말했지만 채울 코드가 없었다. 이 표가 그 채우는
--   쪽이다.
--
-- words 표와 무엇이 다른가
--   words 는 "이 기사, 이 레벨의 핵심 단어 5개"다 — version_id 에 매여 있고
--   예문과 발음기호를 갖는다. glosses 는 기사에 매이지 않는다. 단어 하나에
--   행 하나이고, 모든 에디션이 같은 표를 공유한다. 영어 어휘는 지프 분포라
--   첫 에디션이 ~1,700개를 사고 나면 이후 에디션은 새로 등장한 것만
--   사면 되고, 하루 비용이 계속 떨어진다. 그것이 이 표를 전역으로 두는
--   유일한 이유다.
--
-- 표제어 형태
--   본문에 나온 표면형을 소문자로 그대로 쓴다("companies" 를 "company" 로
--   되돌리지 않는다). 독자는 화면에 있는 형태를 누르므로 정확히 일치하는
--   조회가 되고, 원형으로 되돌리면 web/src/lib/wordMatcher.ts 가 이미
--   "제대로 된 NLP 없이는 근사치일 뿐"이라고 적어둔 굴절 매칭 문제를 다시
--   불러들인다. 항목 수가 늘어날 뿐 정확도는 얻지 못한다.

create table glosses (
  term       text primary key,   -- 본문 표면형, 소문자 (예: 'companies')
  meaning_ko text not null,      -- 짧은 한국어 뜻 (표제어 수준, 설명문 아님)
  pos        text,               -- 'n.' / 'v.' / 'adj.' … 모델이 안 주면 null
  created_at timestamptz not null default now()
);

alter table glosses enable row level security;

-- 사전은 공개다. 기사와 달리 발행 상태를 따지지 않는다 — 단어의 뜻은
-- 특정 기사에 속한 콘텐츠가 아니라 언어에 속한 사실이고, 어느 기사가
-- 발행됐는지와 무관하게 같은 답이다.
create policy "read glosses" on glosses for select using (true);

-- 쓰기 정책은 두지 않는다. RLS 가 켜져 있고 select 정책만 있으므로 anon /
-- authenticated 키로는 삽입·수정·삭제가 모두 거부되고, 파이프라인이 쓰는
-- service_role 키만 RLS 를 우회한다(a2-data-model.md §5).

-- 조회는 항상 term 목록으로 들어온다(웹: 기사 본문의 단어들, 파이프라인:
-- 이미 아는 단어 확인). primary key 인덱스가 그 조회를 그대로 받는다.
