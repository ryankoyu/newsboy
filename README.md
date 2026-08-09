# BRIEFLY (가칭)

한국인 영어 학습자를 위한 하루 10개 뉴스 서비스. 매일 그날의 주요 사건 10건을 CEFR 레벨(A2/B1/B2)별로 완전히 새로 써서 제공한다. 원문은 절대 그대로 베끼지 않고, 사실만 추출해 소스와의 연결(provenance)을 물리적으로 저장한다.

설계 배경과 결정 근거는 `docs/`를 참고할 것 — 특히 `docs/design/design-decisions.md`(교차 검토·최우선 기준 문서), 지금까지 만든 것과 남은 것은 `docs/production-readiness.md`, 배포 절차는 `docs/DEPLOYMENT.md` 참고.

## 폴더 구조

```
.
├── web/                          # Next.js 앱 (App Router, TypeScript, Tailwind CSS v4) — Vercel 배포 대상
│   └── src/
│       ├── app/                  # 라우트: 홈·기사뷰어·저장·설정·아카이브 + /admin(운영자 검수 콘솔)
│       │   └── globals.css       # 디자인 토큰 (a3-ui-ux.md §0) — 라이트/다크 CSS 변수
│       └── lib/
│           ├── types.ts          # A2 데이터 모델과 1:1 대응하는 공유 TypeScript 타입
│           ├── data/             # 공개 화면용 데이터 제공 인터페이스 + 시드 JSON (아직 Supabase 미연결)
│           └── admin/            # 검수 콘솔 — 인증·세션·로컬 fs 리포지토리(pipeline/output/ 직접 읽기)
│
├── pipeline/                     # 파이프라인 워커 — 8단계 구현 완료 (수집→클러스터링→Top10선정→사실추출→
│   └── src/                      #   레벨별재작성→품질게이트, 검수/발행은 web/admin에서). GitHub Actions로 실행, Vercel과 무관.
│       ├── index.ts              # 진입점 — LLM_PROVIDER/STORAGE/USE_BATCH_API 등 env로 동작 전환
│       ├── pipeline/             # 단계별 구현 (collect/cluster/selectTop10/extract/generate/gate/run)
│       └── storage/               # local(JSON 파일) / supabase(실 스키마 쓰기) 어댑터
│
├── supabase/
│   └── migrations/
│       ├── 0001_schema.sql       # 전체 DDL + pipeline_runs 테이블 + RLS 정책
│       └── 0002_user_library.sql # 저장한 문장(saved_sentences) 확장
│
├── .github/workflows/
│   └── daily-pipeline.yml        # 파이프라인 일일 스케줄 (KST 새벽 5시) + 수동 실행(workflow_dispatch)
│
└── docs/
    ├── DEPLOYMENT.md             # Vercel + Supabase 배포 체크리스트 (비개발자용, 단계별)
    ├── production-readiness.md   # 실서비스화까지 남은 것 — 우선순위·최단 경로
    ├── design/                   # A1(아키텍처) · A2(데이터 모델) · A3(UI/UX) · design-decisions
    └── research/                 # R1~R6 (소스 조사, 유사 서비스, 파이프라인 실험, 저작권/법률, 소스 확장)
```

## 실행 방법

### web/ (Next.js 프론트엔드)

```bash
cd web
cp .env.example .env.local   # ADMIN_PASSWORD 등 채우기 (web/.env.example 각 항목 주석 참고)
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm test         # Vitest
```

검수 콘솔은 `http://localhost:3000/admin` — `pipeline/output/editions/*.json`을 직접 읽고 쓴다(로컬 전용, Supabase 연결 전 임시 구조 — `web/src/lib/admin/` 참고).

### pipeline/ (파이프라인 워커)

```bash
cd pipeline
cp .env.example .env   # ANTHROPIC_API_KEY 등 채우기 (pipeline/.env.example 각 항목 주석 참고)
npm install
npm start         # src/index.ts 실행 — 기본값: LLM_PROVIDER=anthropic, STORAGE=local
npm run typecheck
npm test
```

비용 없이 동작만 확인하려면 `LLM_PROVIDER=mock STORAGE=local npm start`.

### supabase/ (DB 스키마)

Supabase 대시보드 SQL Editor에 `supabase/migrations/0001_schema.sql` → `0002_user_library.sql` 순서로 그대로 실행. 상세 절차는 `docs/DEPLOYMENT.md` 1단계 참고.

## 배포

`docs/DEPLOYMENT.md`에 Vercel(웹) + Supabase(DB) + GitHub Actions(파이프라인 스케줄) 연결을 처음부터 끝까지 순서대로 정리해 뒀다 — 이번 배포에서 되는 것/안 되는 것(예: `/admin`은 Supabase 연결 전까지 Vercel에서 사용 불가, 안내 화면으로 처리됨)도 그 문서에 명시돼 있다.

## 팀 인수인계 메모

- **프론트엔드**: `web/src/lib/types.ts`의 타입과 `web/src/lib/data/`의 `DataProvider` 인터페이스를 사용해 화면을 구현한다. 디자인 토큰은 `web/src/app/globals.css`에 이미 정의돼 있으니 raw hex를 새로 쓰지 말 것. 지금은 시드(샘플) 데이터만 나온다 — 실 데이터가 나오려면 `DataProvider`의 Supabase 구현이 필요하다(`production-readiness.md` §1).
- **파이프라인**: `pipeline/src/index.ts`가 8단계를 이미 구현했다. 각 단계마다 `pipeline_runs` 테이블에 실행 기록을 남긴다(A1 §1.3, §5.3). DB 쓰기는 service_role 키로만 가능(RLS 정책상 일반 키로는 콘텐츠 테이블에 쓸 수 없음). `STORAGE=supabase`는 실제 스키마에 쓰도록 구현돼 있지만, 실 프로젝트에 대해 실행해본 적은 아직 없다(모킹 단위 테스트로만 검증) — 오늘이 첫 실측 기회다.
- **공통**: `docs/design/design-decisions.md`가 설계 문서 간 충돌 시 최우선 기준이다.
