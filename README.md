# BRIEFLY (가칭)

한국인 영어 학습자를 위한 하루 10개 뉴스 서비스. 매일 그날의 주요 사건 10건을 CEFR 레벨(A2/B1/B2)별로 완전히 새로 써서 제공한다. 원문은 절대 그대로 베끼지 않고, 사실만 추출해 소스와의 연결(provenance)을 물리적으로 저장한다.

설계 배경과 결정 근거는 `docs/`를 참고할 것 — 특히 `docs/design/design-decisions.md`(교차 검토·최우선 기준 문서).

## 폴더 구조

```
.
├── web/                        # Next.js 앱 (App Router, TypeScript, Tailwind CSS v4)
│   └── src/
│       ├── app/                # 라우트 (현재는 골격만 — 화면 구현은 프론트엔드 팀 몫)
│       │   └── globals.css     # 디자인 토큰 (a3-ui-ux.md §0) — 라이트/다크 CSS 변수
│       └── lib/
│           ├── types.ts        # A2 데이터 모델과 1:1 대응하는 공유 TypeScript 타입
│           └── data/           # 데이터 제공 인터페이스 + 시드 JSON 구현 (목 데이터 레이어)
│
├── pipeline/                   # 파이프라인 워커 (빈 골격 — 구현은 파이프라인 팀 몫)
│   └── src/index.ts            # 8단계 파이프라인 진입점 스텁 (a1-architecture.md §2)
│
├── supabase/
│   └── migrations/
│       └── 0001_schema.sql     # 전체 DDL (A2 §4) + pipeline_runs 테이블 + RLS 정책 (A2 §5)
│
└── docs/
    ├── design/                 # A1(아키텍처) · A2(데이터 모델) · A3(UI/UX) · design-decisions
    └── research/               # R1~R4 (소스 조사, 유사 서비스, 파이프라인 실험, 저작권/법률)
```

## 실행 방법

### web/ (Next.js 프론트엔드)

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
```

### pipeline/ (파이프라인 워커 — 골격만, 구현 전)

```bash
cd pipeline
npm install
npm run start     # src/index.ts 실행 (현재는 스텁 로그만 출력)
npm run typecheck
```

### supabase/ (DB 스키마)

Supabase 프로젝트에 마이그레이션 적용:

```bash
supabase db push
# 또는 Supabase 대시보드 SQL Editor에 supabase/migrations/0001_schema.sql 내용을 그대로 실행
```

## 후속 팀 인수인계 메모

- **프론트엔드 팀**: `web/src/lib/types.ts`의 타입과 `web/src/lib/data/`의 데이터 제공 인터페이스를 사용해 화면을 구현한다. 디자인 토큰은 `web/src/app/globals.css`에 이미 정의돼 있으니 raw hex를 새로 쓰지 말 것. 시드 데이터는 R3 문서에서 실제 제작된 기사 2건뿐이므로(Top 10 중 2개), 나머지 8개는 파이프라인 팀 산출물을 기다려야 한다.
- **파이프라인 팀**: `pipeline/src/index.ts`에 8단계(수집→클러스터링→Top10선정→사실추출→레벨별재작성→품질게이트→검수→발행)를 구현한다. 각 단계마다 `pipeline_runs` 테이블에 실행 기록을 남길 것(A1 §1.3, §5.3). DB 쓰기는 service_role 키로만 가능(RLS 정책상 일반 키로는 콘텐츠 테이블에 쓸 수 없음).
- **공통**: `docs/design/design-decisions.md`가 설계 문서 간 충돌 시 최우선 기준이다.
