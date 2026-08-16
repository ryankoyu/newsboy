# 변호사에게 물어볼 것 — 코드 실측 기반

작성: 2026-08-17 · 근거: `pipeline/src/`, `web/src/`, `supabase/migrations/` 실측
선행 문서: `docs/research/r4-copyright-legal.md` (2026-07-13, 조사 단계에서 준비한 질문 7개)

---

## 이 문서를 쓰는 이유

r4는 "이런 서비스를 만들면 무엇이 문제인가"를 조사 단계에서 정리했다. 이 문서는 그 뒤에
**실제로 만들어진 코드**를 읽고, r4가 예상하지 못했거나 구현이 예상과 다르게 끝난
지점만 골라 적은 것이다. r4의 7개 질문과 중복되는 것은 넣지 않았다.

**변호사가 아닌 사람이 코드를 읽고 정리한 목록이다. 법률 판단이 아니라 상담 준비물이다.**
각 항목의 "근거" 줄은 그 질문이 어디서 나왔는지를 가리킨다 — 상담 자리에서 코드를 열어
확인할 수 있도록 파일과 심볼 이름을 함께 적었다.

### 지금 상태 (질문의 전제)

- **아직 배포되지 않았다.** 도메인도 서버도 없다(`docs/production-readiness.md` §1).
  아래 위험은 "지금 새고 있는 것"이 아니라 **공개 스위치를 켜는 순간 새는 것**이다.
- 매일 RSS 35개 피드에서 뉴스를 모아, 2개 이상 매체가 확인한 사실만 골라, AI가 A2/B1/B2
  세 단계 영어로 다시 쓴 뒤, **사람이 승인해야만** 발행된다(`web/src/lib/admin/publishToSupabase.ts` —
  `published`를 쓰는 유일한 코드 경로).
- 무료. 광고 없음. 결제 없음. 이메일 링크 로그인만 있다.
- 저장소는 공개(`github.com/ryankoyu/newsboy`).

---

## A. 저작권

### A-1. n-gram 8%가 "실질적 유사성" 방어선으로 충분한가?

원문 복제를 막는 게이트는 6단어 창(6-gram) 기준 중복률 8% 이하면 통과시킨다.
산술하면 **A2 기사에서 연속 17단어, B2 기사에서 연속 43단어**를 원문 그대로 옮겨도
통과한다.

- 근거: `pipeline/src/gates/ngram.ts` — `NGRAM_SIZE = 6`, `OVERLAP_THRESHOLD = 0.08`
- 함께 물을 것: 이 수치를 낮추면 어디까지가 안전한가? 아니면 비율이 아니라 **연속 길이**
  상한(예: 연속 10단어 초과 금지)이 맞는 기준인가?

### A-2. 게이트가 RSS 요약문하고만 비교한다 — 원문 전문과의 중복은 검사되지 않는다

파이프라인은 RSS의 title/summary만 수집한다(전문 크롤링을 하지 않는 것이 수집 원칙).
그래서 중복 검사도 요약문하고만 이뤄진다. **기사 전문과 얼마나 겹치는지는 구조적으로
알 수 없다.**

- 근거: `pipeline/src/gates/ngram.ts`가 비교하는 대상은 `s.title + s.summary` ·
  `pipeline/src/pipeline/collect.ts` 머리말("Only the RSS feed's own title/summary fields are read")
- 함께 물을 것: 전문을 확인하지 않은 상태에서 "원문을 그대로 옮기지 않는다"고 독자에게
  말해도 되는가?

### A-3. 원문 제목은 아예 검사하지 않는다

프롬프트에 "원문 헤드라인을 재사용하지 말라"고 써 있을 뿐, 게이트 5종
(CEFR·중복률·2소스·단어일치·분량) 중 **생성된 제목을 검사하는 것은 하나도 없다.**
우연히 같아진 제목이 나가도 파이프라인은 모른다.

- 근거: `pipeline/src/pipeline/gate.ts` `gateVersion()` — `checkNgramOverlap(currentVersion.content, …)`.
  `currentVersion.title`은 어떤 검사에도 들어가지 않는다

### A-4. 원문 제목이 DB에 저장되고, 공개 키로 조회된다

수집한 기사의 원문 제목이 `sources.title`과 `articles.event_summary`에 그대로 저장된다.
화면에는 안 나오지만, RLS 정책이 행 단위라 **발행된 기사의 이 열들은 anon 키로 읽힌다.**

- 근거: `supabase/migrations/0001_schema.sql` 정책 `"read published articles"` / `"read sources of published"`는
  열을 제한하지 않는다 · `pipeline/src/pipeline/run.ts`가 `eventSummary: event.title`로 원문 제목을 넣는다
- 함께 물을 것: 화면 비노출 + API 조회 가능은 "이용"인가?

### A-5. 출처 표기를 하지 않기로 한 선택이 저작권 방어에 불리한가?

2026-08-13 운영자 결정으로 기사 하단의 원문 링크 목록을 없앴다. 지금 독자는 어느 매체를
참고했는지 알 수 없다. r4 질문 ⑥은 "어떤 문구로 표기해야 안전한가"였고, 이건
**표기를 아예 안 하는 선택**이 위험을 올리는지 내리는지다.

- 근거: 커밋 `ca52761` · `web/src/components/ProvenanceNote.tsx`(출처 이름 없이 교차확인 사실만 고지)

### A-6. 직접 인용 처리에 대한 두 지시가 서로 반대다

사실 추출 프롬프트는 "직접 인용은 원문에서 **글자 그대로 복사**하거나 아예 버려라"라고
하고, 재작성 프롬프트는 "원문의 문장을 **절대 그대로 쓰지 말라**"고 한다. 인용문이 어느
쪽 규칙을 따라 기사에 들어가는지가 코드상 명확하지 않다.

- 근거: `pipeline/src/llm/anthropic.ts` `extractFacts()` 시스템 프롬프트 vs `FABRICATION_GUARDRAIL`

---

## B. 개인정보

### B-1. 이메일 하나만 받는 서비스도 개인정보처리방침 게시 의무가 있는가? 지금 이미 위반인가?

이메일 링크 로그인이 **이미 동작한다**(`AccountSection.tsx`의 `signInWithOtp`).
그런데 처리방침·이용약관 페이지가 라우트에 없다. 실제 이용자가 0명이면 판단이 달라지는가?

- 근거: `web/src/app/` 라우트 전수(about·admin·archive·article·onboarding·saved·settings) — 약관/방침 없음

### B-2. 탈퇴·삭제 기능 없이 계정 기능을 열어도 되는가?

계정 삭제 코드가 리포지토리 전체에 없다. `web/src/lib/sync/merge.ts`는 머리말에
"삭제는 이 모듈이 표현할 수 없는 개념"이라고 적혀 있다. 로그아웃은 로컬 데이터를 지우지
않는다.

- 근거: `web/src/lib/sync/merge.ts` · `web/src/components/AccountSection.tsx` `signOut()` 주석
- 함께 물을 것: "요청 시 수동 삭제"로 갈음할 수 있는가? 그렇다면 화면에 무엇을 적어야 하는가?

### B-3. 읽은 기사 기록이 민감정보로 취급될 여지가 있는가?

`reading_progress`에 **누가, 언제, 어떤 기사를 읽었는지**가 계정에 붙어 쌓인다.
기사에는 정치·사회 사안이 포함된다.

- 근거: `supabase/migrations/0001_schema.sql` `reading_progress(user_id, article_id, read_level, completed, read_at)`

### B-4. Supabase 도쿄 리전을 쓰면 국외 이전 고지·동의가 어느 수준으로 필요한가?

`docs/DEPLOYMENT.md`는 서울이 없으면 도쿄를 권한다. **실제로 어느 리전을 골랐는지는
코드·문서 어디에도 기록이 없다**(§D-2 참조).

### B-5. 만 14세 미만 이용자 처리

연령 확인 코드가 없다. 영어 학습 서비스라 미성년 이용자가 자연스럽게 유입될 수 있다.

- 근거: `web/src`에 연령 관련 코드 0건

### B-6. 수집 동의 절차가 없다

로그인 폼은 이메일 입력칸과 "로그인 링크 받기" 버튼뿐이다. 동의 체크박스도, 처리방침
링크도 없다.

- 근거: `web/src/components/AccountSection.tsx`

---

## C. 콘텐츠 책임

### C-1. AI 재작성 사실을 화면에 고지할 법적 의무가 있는가?

2026-08-16에 고지를 넣었다(기사 하단 + /about). 넣기 전에는 없었다.
**지금 문구와 위치로 충분한가?**

- 현재 문구: "기사 문장은 AI가 새로 썼고, 사람이 검수한 뒤 발행했습니다."
- 근거: `web/src/components/ProvenanceNote.tsx` · `web/src/app/about/page.tsx`
- 함께 물을 것: 「인공지능 발전과 신뢰 기반 조성 등에 관한 기본법」의 생성형 AI 고지 규정이
  이 서비스에 적용되는가? (조문 번호는 확인하지 못했다)

### C-2. AI가 쓴 기사가 실명 기업·인물에 대해 사실을 틀리면 책임은 어떻게 오는가?

**사실 정확성을 검사하는 게이트가 없다.** 게이트 5종은 난이도·중복·출처 수·단어 일치·분량을
본다. 2소스 게이트조차 "재작성된 산문을 다시 파싱해 어느 사실을 실제로 인용했는지는 확인하지
않는다"고 스스로 적어두었다. 최종 방어선은 사람 검수 1인이다.

- 근거: `pipeline/src/pipeline/gate.ts` `gateVersion()`의 5개 검사 · `pipeline/src/gates/twoSource.ts` 머리말
- 실제 기사에 들어간 실명 예: Samsung Electronics, SK hynix, Alibaba (`web/src/lib/data/seed/article_versions.json`)

### C-3. 인터넷신문 등록 의무 / 정정보도 청구 대상인가?

매일 10건을 자체 기준으로 선정(`selectTop10.ts`)해 자기 제목·자기 문장으로 발행하고,
카테고리가 World/Business/Korea다.

- 함께 물을 것: 「신문 등의 진흥에 관한 법률」의 인터넷신문, 「언론중재 및 피해구제 등에 관한
  법률」의 적용 대상이 되는가? 된다면 등록 의무와 정정 절차 구비 의무가 생기는가?
  (조문 번호는 확인하지 못했다)

### C-4. 정정·삭제 요청 창구를 미리 만들어 둘 법적 필요가 있는가?

화면에 연락처·문의·정정 요청 경로가 하나도 없다. 푸터 자체가 없다.

- 근거: `web/src/components/AppShell.tsx` — SideNav / AppHeader / TabBar만 렌더

### C-5. 사전 뜻(AI 생성)에 대한 책임은 다른가?

2026-08-17부터 기사 본문의 모든 단어에 AI가 만든 한국어 뜻이 붙는다(약 1,700개/일).
고유명사는 의도적으로 비워둔다 — 회사·인물을 설명하는 것은 세상에 대한 사실 주장이라고
보았기 때문이다.

- 근거: `pipeline/src/pipeline/glossary.ts` · `supabase/migrations/0006_glosses.sql`
- 함께 물을 것: 사전 뜻이 틀렸을 때의 책임은 기사 내용이 틀렸을 때와 다르게 보는가?
  고유명사를 비워두는 선택이 적절한 방향인가?

### C-6. `/about`의 서술이 표시광고법상 문제가 되는가?

2026-08-16까지 `/about`은 "모든 기사 하단에 원문 링크를 남긴다"고 두 번 적고 있었는데,
그 링크는 8월 13일에 없어져 있었다. **사흘간 사실과 다른 서술이 떠 있었다**(현재는 삭제).

- 함께 물을 것: 무료 서비스의 신뢰 문구에도 「표시·광고의 공정화에 관한 법률」이 적용되는가?
  적용된다면 지나간 사흘에 대한 조치가 필요한가? (조문 번호는 확인하지 못했다)

---

## D. 사람이 확인해야 할 것 (코드로 알 수 없음)

### D-1. RSS 35개 피드 각각의 상업적 재사용 약관 🔴

- 목록: `pipeline/src/config/sources.ts`
- 일부만 확인됨(`docs/research/r6-source-expansion.md` — CNBC·MarketWatch·France24 등)
- **가장 불확실한 것**: Google News RSS 11개. `docs/research/r1-news-sources.md`가
  "Google 약관상 '스크래핑' 성격 논쟁 여지 [추측]"이라고만 적어둔 상태다
- **이미 경고된 것**: BBC RSS는 "개인용(personal, non-commercial) 전제"로 조사됨(r1)

### D-2. Supabase 프로젝트의 실제 리전

코드·환경변수·문서 어디에도 없다. 대시보드에서 직접 확인해야 처리방침을 쓸 수 있다.

### D-3. Supabase 인증 로그에 실제로 무엇이 남는가

이메일 OTP 로그인이 IP·User-Agent·로그인 시각을 어디에 얼마나 보관하는지는 Supabase 쪽
스키마다. 이 리포지토리에는 없다.

### D-4. Anthropic API의 데이터 보존·학습 정책

RSS 요약문이 매일 Anthropic으로 전송된다(`pipeline/src/llm/anthropic.ts`).
사용자 개인정보는 프롬프트에 들어가지 않는다(확인함).

### D-5. GDELT API 이용약관

`pipeline/src/pipeline/globalImpact.ts`가 매일 최대 30회 호출한다. rate limit만 확인됐고
약관은 확인되지 않았다.

### D-6. 저장소 공개 여부에 따른 판단

`web/src/lib/data/seed/sources.json`에 원문 제목·URL이 커밋돼 있고, 저장소는 **공개**다.

### D-7. 사람 검수의 실제 운용

코드는 검수 화면과 승인 차단을 제공하지만, 사람이 무엇을 얼마나 보는지는 코드가 답할 수 없다.
C-2의 유일한 방어선이므로 실제 절차를 문서로 남겨야 한다.

---

## 상담 우선순위 (제 판단, 법률 의견 아님)

배포 전에 답이 필요한 것: **A-1, A-5, B-1, B-2, C-1, C-3**
배포와 병행 가능: 나머지
지금 바로 사람이 할 수 있는 것: **D-1, D-2**
