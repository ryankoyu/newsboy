# Newsboy (구 가칭 BRIEFLY)

한국인 영어 학습자를 위한 하루 10개 뉴스 서비스. 매일 그날의 주요 사건 10건을 CEFR 레벨(A2/B1/B2)별로 완전히 새로 써서 제공한다. 원문은 절대 그대로 베끼지 않고, 사실만 추출해 소스와의 연결(provenance)을 물리적으로 저장한다.

설계 배경과 결정 근거는 `docs/`를 참고할 것 — 특히 `docs/design/design-decisions.md`(교차 검토·최우선 기준 문서). **지금 무엇이 실제로 동작하는지는 `docs/feature-status.md`가 단일 기준이고**, 남은 일의 우선순위는 `docs/production-readiness.md`, 배포 절차는 `docs/DEPLOYMENT.md` 참고.

> 현재 상태 한 줄 요약 (2026-08-12): 파이프라인은 실 Supabase에 기사를 쓸 수 있고(1건 확인, 10건 규모는 미확인), 운영자 검수 콘솔은 로컬에서 동작한다. **아직 안 붙은 곳은 웹사이트 ↔ Supabase 읽기** — 그래서 웹은 여전히 시드 JSON을 보여준다. 일일 cron은 의도적으로 꺼져 있다.
>
> ⚠️ **작업 트리에만 있고 아직 커밋되지 않은 기능이 있다** — Layer 2 GDELT 신호·Layer 3 LLM 편집회의·반려 재생성 배치·단계 재개·CI 워크플로, 그리고 **마이그레이션 `0003_article_status_held.sql`·`0004_words_pos_and_categories_seed.sql`·`0005_pipeline_checkpoints.sql` 세 개**. GitHub에 push된 코드에는 없으므로, Actions·Vercel은 아직 이 기능들을 실행하지 않는다. **지금 clone 하면 `supabase/migrations/`에는 0001·0002 두 개뿐이라 아래 "supabase/" 절차의 5개 실행을 그대로 따를 수 없다** — 커밋 전까지는 이 세 파일을 가진 사람에게 받아야 한다. 상세는 `docs/feature-status.md` G14.

## 폴더 구조

```
.
├── web/                          # Next.js 앱 (App Router, TypeScript, Tailwind CSS v4) — Vercel 배포 대상
│   └── src/
│       ├── app/                  # 라우트 8종: 홈·기사뷰어·저장·설정·아카이브·about·온보딩 + /admin(운영자 검수 콘솔)
│       │   └── globals.css       # 디자인 토큰 (a3-ui-ux.md §0) — 라이트/다크 CSS 변수
│       ├── components/
│       │   └── newsprint/        # ⚠️ 현재 기본 UI인 1902년 신문 스킨 (라이트 전용, 다크는 표준 스킨 폴백)
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
│   └── migrations/               # ⚠️ 스키마의 단일 기준. 설계 문서(a2)보다 이쪽이 실제다. 5개 — 번호 순서대로 실행
│       ├── 0001_schema.sql       # 전체 DDL + pipeline_runs 테이블 + RLS 정책
│       ├── 0002_user_library.sql # 저장한 문장(saved_sentences) 확장
│       ├── 0003_article_status_held.sql          # article_status 에 'held' 추가
│       ├── 0004_words_pos_and_categories_seed.sql # words.is_key/pos 컬럼 + categories 시드
│       └── 0005_pipeline_checkpoints.sql          # pipeline_checkpoints — 중단된 실행 재개용 단계 체크포인트
│
├── .github/workflows/
│   ├── daily-pipeline.yml        # 수동 실행(workflow_dispatch). ⚠️ 일일 cron 은 현재 주석 처리(꺼짐)
│   └── ci.yml                    # push·PR 마다 pipeline typecheck+test, web test+build
│                                 # ⚠️ 아직 커밋 전 — GitHub 에 없어 실행 이력 0건 (docs/feature-status.md G14)
│
└── docs/
    ├── DEPLOYMENT.md             # Vercel + Supabase 배포 체크리스트 (비개발자용, 단계별)
    ├── feature-status.md         # 기능의 단일 기준 — 지금 무엇이 실제로 동작하는가
    ├── production-readiness.md   # 실서비스화까지 남은 것 — 우선순위·최단 경로
    ├── design/                   # A1(아키텍처) · A2(데이터 모델) · A3(UI/UX) · design-decisions
    ├── newsprint-cuts/           # 뉴스프린트 스킨의 기사 컷(제목 이미지) 규칙·프롬프트
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
npm test         # Vitest — 269개 통과 (27파일, 2026-08-12 실측. 반드시 이 스크립트로 실행할 것, 아래 주의)
```

> ⚠️ web 테스트는 `npx vitest`로 직접 돌리지 말 것. `package.json`의 test 스크립트가 붙여주는 `NODE_OPTIONS=--no-experimental-webstorage` 없이 돌리면 81개가 localStorage 관련 오류로 실패한다 — 코드 결함이 아니라 실행 방법 문제다.

검수 콘솔은 `http://localhost:3000/admin` — `pipeline/output/editions/*.json`을 직접 읽고 쓴다(로컬 전용, Supabase 연결 전 임시 구조 — `web/src/lib/admin/` 참고).

### pipeline/ (파이프라인 워커)

```bash
cd pipeline
cp .env.example .env   # ANTHROPIC_API_KEY 등 채우기 (pipeline/.env.example 각 항목 주석 참고)
npm install
npm start         # src/index.ts 실행 — 기본값: LLM_PROVIDER=anthropic, STORAGE=local
npm run typecheck
npm test          # 225개 통과 (26파일, 2026-08-12 실측)
npm run regenerate -- 2026-08-11   # 검수 콘솔에서 '반려'된 기사만 다시 씀
```

비용 없이 동작만 확인하려면 `LLM_PROVIDER=mock STORAGE=local npm start`.

주요 환경변수(전체는 `pipeline/src/index.ts` 머리 주석):

- `RESUME` — 기본 켜짐. 같은 날짜 실행이 중간에 죽었으면 마지막 성공 단계의 체크포인트부터 이어서 돈다(`RESUME=false`면 처음부터). 재개한 단계는 로그에 `(체크포인트에서 재개 — 재실행 안 함)`으로 표시된다.
- `GDELT` — 기본 켜짐. Layer 2의 "글로벌 영향력" 신호를 GDELT 메타데이터(몇 개국 매체가 다뤘는가)로 채운다. 무료·키 불필요이지만 5초에 1회 제한이 있어 실행당 요청 수에 상한을 둔다. `GDELT=false`로 끄면 그 신호만 빠지고 나머지는 그대로 돈다.
- `MAX_ARTICLES` — 기사 수 상한(시험 실행용).

⚠️ 테스트 숫자와 `regenerate`·`RESUME`·`GDELT`는 **2026-08-12 로컬 작업 트리 기준**이다. 이 기능들의 파일 일부는 아직 커밋되지 않았다 — `docs/feature-status.md` G14 참고.

### supabase/ (DB 스키마)

Supabase 대시보드 SQL Editor에 `0001_schema.sql` → `0002_user_library.sql` → `0003_article_status_held.sql` → `0004_words_pos_and_categories_seed.sql` → `0005_pipeline_checkpoints.sql` **5개를 번호 순서대로** 실행. 상세 절차는 `docs/DEPLOYMENT.md` 1단계 참고.

0003·0004를 빼먹으면 파이프라인이 **쓰기 단계에서 실패한다** — `held` 상태 저장과 `words.pos`/`is_key` insert가 존재하지 않는 enum 값·컬럼을 참조하기 때문이다(`pipeline/src/storage/supabase.ts`).

0005를 빼먹으면 실행은 되지만 **재개가 안 된다** — 중간에 죽은 실행이 이미 돈을 치른 재작성분을 버리고 처음부터 다시 돈다(`RESUME` 항목 참고).

## 배포

`docs/DEPLOYMENT.md`에 Vercel(웹) + Supabase(DB) + GitHub Actions(파이프라인 스케줄) 연결을 처음부터 끝까지 순서대로 정리해 뒀다 — 이번 배포에서 되는 것/안 되는 것(예: `/admin`은 Supabase 연결 전까지 Vercel에서 사용 불가, 안내 화면으로 처리됨)도 그 문서에 명시돼 있다.

## 팀 인수인계 메모

- **프론트엔드**: `web/src/lib/types.ts`의 타입과 `web/src/lib/data/`의 `DataProvider` 인터페이스를 사용해 화면을 구현한다. 디자인 토큰은 `web/src/app/globals.css`에 이미 정의돼 있으니 raw hex를 새로 쓰지 말 것. 지금은 시드(샘플) 데이터만 나온다 — 실 데이터가 나오려면 `DataProvider`의 Supabase 구현이 필요하다(`production-readiness.md` §1).
- **파이프라인**: `pipeline/src/index.ts`가 8단계를 이미 구현했다. 각 단계마다 `pipeline_runs` 테이블에 실행 기록을 남긴다(A1 §1.3, §5.3). DB 쓰기는 service_role 키로만 가능(RLS 정책상 일반 키로는 콘텐츠 테이블에 쓸 수 없음). `STORAGE=supabase`는 **2026-08-11 실 프로젝트에 대해 실행돼 기사 1건을 실제로 기록했다**(GitHub Actions run `31493703937`). ⚠️ 단 그 실행은 `MAX_ARTICLES=2`였고, 쓰기 뒤 프로세스가 끝나지 않아 결국 **취소(cancelled)로 종료**됐다 — 에디션 10건을 끝까지 쓴 실행은 아직 없다(`docs/DEPLOYMENT.md` 3단계 표 참고).
- **공통**: `docs/design/design-decisions.md`가 설계 문서 간 충돌 시 최우선 기준이다.
