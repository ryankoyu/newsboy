# 기능 상태 — 단일 기준 문서 (Feature Status)

> **이 문서가 Newsboy(구 가칭 BRIEFLY) 기능의 단일 기준이다. 기능을 추가·변경·보류할 때마다 이 문서를 갱신한다.**
> 계획은 여러 문서(project-brief / design-decisions / a3-ui-ux / enhancement-plan / top10-curation / production-readiness)에 흩어져 있고, 그 문서들은 "그때 무엇을 정했는가"의 기록이다.
> 이 문서는 "지금 무엇이 실제로 동작하는가"의 기록이다. 둘이 다르면 이 문서를 먼저 고친다.

작성: 2026-07-17 · 최종 갱신: **2026-08-12** · 검증 기준: 브랜치 `main`, HEAD `316ca2d` + **미커밋 작업 트리** (2026-08-12 실측)

> ⚠️ **검증 기준 주의 — 아래 기능 일부는 아직 커밋되지 않았다.** 2026-08-11 판까지 이 문서는 검증 기준을 `feat/newsprint-skin-and-pipeline-cost` 브랜치의 `8f599fd`로 적어 뒀는데, 그 사이 작업은 `main`으로 옮겨져 `316ca2d`까지 진행됐고 그 위에 커밋되지 않은 변경이 얹혀 있다. `git ls-files --others --exclude-standard` 실측 결과 **아직 추적되지 않는(untracked) 작업 트리 전용 파일은 26개**다(2026-08-12 6차). 그중에는 `supabase/migrations/0003_article_status_held.sql` · `0004_words_pos_and_categories_seed.sql` · `0005_pipeline_checkpoints.sql`이 들어 있는데, 이 셋은 `docs/DEPLOYMENT.md` 1단계와 `README.md`가 **"빼먹으면 파이프라인이 쓰기 단계에서 실패한다"(0003·0004) 또는 "재개가 안 된다"(0005)며 필수로 지정한 파일**이다. 즉 **이 문서의 판정은 "지금 이 작업 트리에서 확인한 것"이고, GitHub에 push된 코드에는 아직 없는 기능이 섞여 있다.** 커밋 전까지는 CI도, 다른 사람의 체크아웃도 이 기능들을 볼 수 없다. 전체 26개 목록과 파장은 §2 G14.

> 2026-08-11 갱신 메모: 이 문서는 2026-07-17 이후 코드가 크게 움직였는데도 갱신되지 않아, "미구현"이라고 적힌 기능이 실제로는 구현돼 있는 상태가 한동안 이어졌다(검수 콘솔·World 지역 분산·OG 메타·매체 수 dedup 등). 이번 갱신은 그 격차를 코드 실측으로 메운 것이다. §4-4의 "갭을 고치면 해결 표시와 날짜를 남긴다" 규칙을 §2에 소급 적용했다.
>
> 2026-08-12 갱신 메모: 같은 일이 한 달이 아니라 **하루 만에** 다시 벌어졌다. 문서가 검증 기준(브랜치·커밋)을 갱신하지 않은 채 한 세대 뒤 코드를 서술하는 바람에, 실제로는 구현된 Layer 3 편집회의·GDELT 신호·반려(재생성) 경로·체크포인트 재개가 "미구현/부분 구현"으로 적혀 있었다. 이번 갱신은 그 11건을 코드·테스트·Actions 로그 실측으로 정정한 것이다.

## 판정 범례

| 기호 | 뜻 |
|---|---|
| ✅ | 구현되어 있고 실제 동작을 확인함 |
| △ | 부분 구현 — 무엇이 부족한지 비고에 명시 |
| ❌ | 미구현 |
| 🔒 | 의도적 보류 (사용자 지시·설계 결정. §3 참조) |

## 검증 방법

- **실화면**: `web`을 3105 포트로 띄우고 헤드리스 Chromium(Playwright)으로 홈 → 기사 → 레벨 전환 → 단어 클릭 → 사전 → 저장 → 문장 저장 → My 3서랍 → 온보딩 3단계 → 완주 화면 → 아카이브 → /about → /settings → 데스크톱(1280) 까지 실제 클릭하며 확인. (2026-07-17 기준. 2026-08-11의 뉴스프린트 스킨 전환 이후 이 실화면 전수 확인은 **아직 다시 돌리지 않았다** — 1-B·1-D의 "실화면" 판정은 표준 스킨 시절의 확인 기록이라는 점을 감안할 것. §2 G13 참조.)
- **코드**: `web/src/`, `pipeline/src/` 해당 파일 확인 (함수 존재가 아니라 실행 경로에 배선되었는지까지).
- **산출물**: `pipeline/output/editions/2026-07-14.json`, `output/runs/*.json`, `gate-report-2026-07-13.json`, `selection-comparison-2026-07-13.json` 실측.
- **테스트**: web 269개(27파일) + pipeline 225개(26파일) = **494개 전부 통과** (2026-08-12 6차 재실측 — `cd web && npm test` → "Test Files 27 passed (27) / Tests 269 passed (269)", `cd pipeline && npm test` → "Test Files 26 passed (26) / Tests 225 passed (225)"). 2026-08-11 판의 "446개"는 그날 이후 추가된 테스트 파일(`layer2Layer3.test.ts`·`regenerate.test.ts`·`resume.test.ts`·`web/src/app/admin/actions.test.ts`·`Segmented.test.tsx`·`newsprint/*.test.tsx` 등)을 세지 않은 값이다.
  - ⚠️ **같은 날 1차로 적었던 "pipeline 216 / 합계 485"는 틀렸다 (2026-08-12 4차 정정).** 그 값을 적은 뒤 작업 트리의 `pipeline/src/gates/cefr.test.ts`가 수정돼 테스트가 1개 늘었는데 재측정하지 않았다. 파일 수(26/27)는 그때도 맞았고 pipeline 테스트 수만 1개 어긋나 있었다. 216/485는 이 문서(§검증 방법 · §1-F 테스트 안전망 행 · §1-A CI 행 · G14)와 `README.md`·`docs/production-readiness.md`에 나뉘어 복사돼 있었다 — 숫자를 여러 문서에 퍼뜨리면 한 번의 재측정으로는 못 따라잡는다는 증거다.
  - ⚠️ 이 494개 중 상당수는 **아직 커밋되지 않은 파일의 테스트**다(문서 머리의 검증 기준 주의 참조). 커밋 전까지는 다른 사람이 체크아웃해도 이 숫자가 나오지 않는다.
  - ⚠️ **"486"은 5차(2026-08-12)에 이미 낡은 값이었고, 6차에서 494로 일괄 정정했다.** 5차의 체크포인트 작업으로 pipeline 테스트가 217 → **225**(26파일, 신규 8건 `supabase.test.ts`)가 됐는데 web 269(27파일)는 그대로라 합계가 **494**가 됐다. 5차는 "한 곳만 고치면 나머지가 어긋난다"며 정정을 미뤘고, 그 사이 이 문서 안에서 본문은 486을, 이 주석은 494를 말하는 상태가 됐다 — **미룬 정정은 모순으로 굳는다.** 6차에서 재실측(`cd pipeline && npm test` → 26파일/225개, `cd web && npm test` → 27파일/269개) 후 흩어져 있던 사본 전부(§검증 방법 · §1-A CI 워크플로 행 · §1-F 테스트 안전망 행 · G11 · G14 · `README.md` · `docs/production-readiness.md` 두 곳)를 한 번에 494로 맞췄다. 다음에 테스트가 늘면 **같은 목록을 한 번에** 고칠 것.
  - ⚠️ web 테스트는 반드시 `npm test`로 돌릴 것. `web/package.json`의 test 스크립트가 `NODE_OPTIONS=--no-experimental-webstorage`를 붙여준다. 이 플래그 없이 `npx vitest`로 돌리면 81개가 localStorage 관련 오류로 실패한다 — 코드 결함이 아니라 실행 방법 문제다.

---

# 1. 기능 인벤토리

## 1-A. 콘텐츠 파이프라인

| 기능 | 계획 출처 | 상태 | 확인 방법 | 비고 |
|---|---|---|---|---|
| 다중 소스 RSS 수집 | brief §5·§15, news-sourcing | ✅ | 코드 `pipeline/src/config/sources.ts` + 산출물 | 35개 피드(world 13/business 8/ai-tech 5/culture-sports 5/korea 4). 실행 기록상 35/35 수집 성공, 2,244건 |
| Google News 지역 다변화 | top10 §2 | ✅ | 코드 | `gl=US` 6 + `gl=GB` 6. Asia/Europe/economy/global markets 쿼리 있음. 아시아 현지판(`gl=JP/IN`)은 없고 현지 매체(Nikkei/SCMP/Straits Times)로 대체 |
| Business 전용 소스 보강 | top10 §2 | ✅ | 코드 | BBC Business·CNBC·MarketWatch·Nikkei Asia 추가 |
| 사건 클러스터링 | brief §5, a1 | △ | 코드 `pipeline/cluster.ts` | 어휘 Jaccard + 48시간 창. 임베딩 미도입(코드 주석에 "임베딩 나중에 교체" 명시, production §9 예정) |
| Top10 카테고리 쿼터 3/2/2/2/1 + 백필 | top10 L1 | △ | 코드 + 산출물 | 코드는 3단 백필까지 구현. **실제 07-14 산출물은 world 3/korea 2/business 3/ai-tech 1/culture 1** — ai-tech가 못 채워져 business로 넘어감 |
| 동일 국가 내부정치 최대 2건 | top10 L1 | △ | 코드 `selectTop10.ts` | 상한은 강제됨. 단 "국가"를 **보도 매체 국적으로 추정** — 사건 주체 국가가 아님(코드에 자기 한계로 기록됨) |
| 동일 인물·기관 중복 금지 | top10 L1 | △ | 코드 `rules.ts` | 대문자 연속 정규식으로 주체를 뽑는 방식. NER 아님 |
| World 3건 지역 분산 | top10 L1 | △ | 코드 | **2026-07-17 배선됨** — `selectTop10.ts:272`가 world 카테고리에 한해 `fillWorldQuotaWithRegionSpread()`를 호출하고, 이 함수가 `rules.ts`의 `regionOf()`로 이미 쓴 지역을 피해 채운다(같은 파일 412행 정의, 400~411행 주석에 한계 명시. **줄 번호는 2026-08-12 재실측** — 2026-08-11 판의 210/339~365는 그 사이 코드가 늘어나 다른 곳을 가리키고 있었다). 남은 한계: 지역 판정이 여전히 **보도 매체 국적** 추정 기반이라 미국 매체가 보도한 유럽 사건은 아메리카로 계산된다. 실산출물로 지역 분산이 실제로 벌어졌는지는 미확인 |
| 톤 밸런스 | top10 L1 | △ | 코드 + 테스트 | 참사 기사 최대 5건 + 마지막 슬롯 비참사 보장은 동작. "가볍거나 긍정적" 판정 신호는 없고 "참사 키워드 아님"으로 갈음 |
| 소스 중복 판정(같은 매체 다른 피드 = 1개) | top10 L1 | ✅ | 코드 `cluster.ts` + sources.ts `outletKey` | 파이프라인 내부는 정상. **웹 표시단에는 미적용 → 결함 G2** |
| Layer 2 중요도 점수 | top10 L2 | △ | 코드 + 단위 테스트 | **2026-08-12 정정 — 6신호 + 감점이 전부 구현·배선돼 있다.** `score.ts`의 `ScoreBreakdown`(선언 `:31` → 닫는 `}` `:43`)에 `globalImpact`(`:37`)·`learnability`(`:39`)·`demerit`(`:41`) 필드, 외부에서 채워 넣는 쪽은 `ExternalSignals`(`:46-50`), 같은 파일 `WEIGHTS`(선언 `:52` → 닫는 `} as const;` `:66`)에 각각 `globalImpact: 2.0`(`:60`) / `learnability: 2.0`(`:63`) / **`demerit: -2.0`**(`:65`), `score.ts:100-118`에서 실제로 합산된다. *(줄 범위는 2026-08-12 4차 재실측 — 이전 판의 `51-63`은 `demerit` 줄을 범위 밖으로 밀어내고 있었다. **심볼명은 6차 정정** — 4~5차 판이 적은 `ScoreInputs`는 `pipeline/src/` 어디에도 없는 이름이다(`grep -rn ScoreInputs src/` 무결과). 줄 번호만 맞고 이름이 틀려 있었다 — 이 문서가 세 번 강조한 "줄 번호에 심볼명을 함께 적어라"는 규칙이 정작 그 규칙을 적용한 자리에서 깨져 있었다.)* GDELT 글로벌 영향력 신호의 구현체는 `pipeline/src/pipeline/globalImpact.ts`(`createGdeltGlobalImpactProvider`)이고 `pipeline/src/index.ts`에서 파이프라인에 주입된다 — import `:61` · 스위치 `const gdeltOn` `:122` · 생성 `const globalImpact = gdeltOn ? createGdeltGlobalImpactProvider({…})` `:123-125` · 주입 `globalImpact,` `:141`(`GDELT=false`로 끌 수 있음). *(줄 번호는 **2026-08-12 7차 재실측**. 4~6차가 적은 `:56,118-119,136`은 네 개 모두 5칸 안팎 어긋나 있었다 — 4차 감사가 "이 근거는 전부 정확했다"고 명시한 자리였다. 기능은 전부 존재했고 줄 번호만 틀렸다.)* 학습 적합성·감점은 Haiku 호출로 채운다(`selectTop10.ts:602`). **△인 이유**: 확인 근거가 코드와 단위 테스트(`layer2Layer3.test.ts` — GDELT 국가 수 집계·429 폴백·쿼리 상한·신호 결측 처리)뿐이고, **실제 GDELT 응답이 반영된 실행 산출물이 아직 없다**(`output/`의 어느 산출물에도 `globalImpact` 필드가 없음 — 08-11 실행들은 이 코드 이전) |
| Layer 3 LLM 편집회의 | top10 L3 | △ | 코드 + 단위 테스트 | **2026-08-12 정정 — 구현돼 있고, 선정 "전에" 호출된다.** `selectTop10.ts`의 `runEditorialMeeting()`(선언 `:631` — **2026-08-12 3차 재실측, 이전 판의 `:632`는 첫 인자 줄이었다**)이 점수 상위 `LAYER3_POOL_SIZE=28` 후보를 `llm.selectTop10()`으로 넘기고, 응답의 `rankInEdition`을 `candidate.llmProposedRank`에 기록(`selectTop10.ts:658`)한 뒤 Layer 1 쿼터가 그 선호 순서대로 채운다(`selectTop10.ts:161`, `722` "Layer 3: the editorial call, BEFORE selection"). LLM 제안은 **재정렬만** 할 수 있고 쿼터·상한·게이트를 넘을 수는 없다(`selectTop10.ts:525`). 호출 실패 시 점수 순서로 폴백하고 그 사실을 한계로 기록한다. 단위 테스트 5개(`layer2Layer3.test.ts` "Layer 3 편집회의"). **△인 이유**: 실행 산출물에 `llmProposedRank`가 남은 에디션이 아직 없다 — 실제 편집회의가 순위를 바꾼 결과를 산출물로 확인하지 못했다 |
| 2소스 검증 게이트 (사실 단위) | brief §14, a2 | ✅ | 코드 `gates/twoSource.ts` | 최소 3개의 본문 기여 사실 요구로 강화(공회전 통과 차단). **07-14 산출물은 강화 이전 코드로 생성 → 결함 G3** |
| CEFR / 원문 중복(6-gram) / 단어-본문 일치 게이트 | §4.6, a1 | ✅ | 코드 `gate.ts` + 산출물 | 실패 시 최대 3회 재작성 재시도. 07-14: 30개 버전 중 29개 통과 |
| A2/B1/B2 생성 분량 (150/310/520) | brief §5 | ✅ | 산출물 실측 | **2026-07-17 `gates/wordCount.ts` 신설로 해결.** 07-14 산출물은 B2 10건 전부 334~447(하한 450 미달)이었으나, 현재 웹 시드(2026-07-13 재생성분) B2 10건은 **451~516단어로 전부 하한 충족**(`article_versions.json` 실측). 레벨별 문단 계획 공유는 커밋 `2fb3dea` |
| isKey 루비용 핵심 단어 생성 | §4.8-3 | ✅ | 프롬프트 + 산출물 | 07-14 단어 150개 전부 isKey 필드 보유, 34개 true (레벨당 0~2개 규칙 준수) |
| 어휘 회피로 핵심 정보 누락 금지 | §4.8-4 | ✅ | 코드 `llm/prompts.ts` | 재작성 프롬프트에 semiconductors 사례까지 명시 |
| 저사용 사실 교체(replaceLowUsableFacts) | 게이트 보강 | ✅ | 코드 + 배선 | run.ts에 배선·감사 로그 저장. 07-14 산출물에는 아직 미반영(구버전 실행) |
| 비용 최적화 — 레벨 통합 생성·프롬프트 캐싱·비용 자동 기록 | 커밋 `2a1129d` | ✅ | 산출물 `output/runs/*.json` | 1회 실행 실측 **약 $1.04**. 캐시 읽기 19,593토큰 실제 발생 |
| 비용 최적화 — Batch API | 커밋 `2a1129d` | △ | 코드 + 산출물 | 코드·스케줄 자동 활성화까지 배선됐으나 **모든 실행 기록에서 `usedBatchApi: false`** — 한 번도 실제로 쓰인 적 없음 |
| 기사 전체 사전 생성 | §4.9 | 🔒 | 문서 | 계획만 확정, 구현 보류 (사용자 지시) |
| 저장소 — Supabase 어댑터 | a1 §3-2 | △ | 코드 + Actions 로그 | **실 DB에 기사 1건을 쓴 것까지는 확인됐다.** 2026-08-11 run `31493703937` 로그: `[pipeline] stage=store ok {"editionDate":"2026-08-11","articles":1,"storage":"supabase"}` → `finished — status=success articles=1`. **다만 2026-08-12 재확인 결과 이 실행의 최종 결론은 `success`가 아니라 `cancelled`다** — 쓰기 로그(13:15:24) 이후 프로세스가 끝나지 않아 13:41:44에 `##[error]The operation was canceled.`로 잘렸다(`gh run list` conclusion=cancelled, 44분 44초). 또 이 실행은 `MAX_ARTICLES=2`였고, `storage=supabase`로 끝난 다른 1건(`31489819663`)은 `llm=mock`이었다 → **anthropic + supabase 조합으로 Top10 10건 전부를 쓴 실행은 아직 없다.** 사실과 달랐던 소스 주석("provisioned yet … never been run")은 2026-08-12에 정정 |
| pipeline_runs 실행 기록 | §1-2 | ✅ | 산출물 `output/runs/` | 단계별 상태·오류·비용 요약 기록됨 |
| GitHub Actions 수동 실행 | §3-1 | ✅ | Actions 실행 이력 | 시크릿 3종(`ANTHROPIC_API_KEY`/`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) 등록 완료. 실행 이력 5건(2026-08-11 `workflow_dispatch` 4건 + 2026-08-10 `schedule` 1건). **결론 내역(2026-08-12 `gh run list` 실측): success 1 / failure 3 / cancelled 1** — 즉 수동 실행 경로는 동작하지만 아직 안정적이지 않다. 워크플로에 산출물 업로드 스텝이 있으나, 마지막 `storage=supabase` 실행은 취소로 끝나 업로드까지 간 것을 확인하지 못했다 |
| CI 워크플로(테스트·빌드 자동 검증) | (계획 문서 없음) | △ | 파일 `.github/workflows/ci.yml` | **2026-08-12 신규 등재.** push·pull_request마다 pipeline `typecheck`+`test`, web `test`+`build`를 돌리는 워크플로가 작업 트리에 있다(Node 22, 시크릿 불필요). 파일 머리 주석이 "지금까지 워크플로는 daily-pipeline.yml뿐이었고 CI에서 테스트가 한 번도 돈 적 없다"고 스스로 밝힌다. **△인 이유: 이 파일은 아직 커밋·push되지 않아 GitHub에 존재하지 않는다 — 실행 이력 0건.** 커밋 전까지 "테스트가 CI에서 돈다"는 말은 사실이 아니다. ~~⚠️ 주석의 테스트 수는 틀렸다("341 tests pass")~~ **✅ 해소 (2026-08-12 7차 실측 확인)**: 3차가 발견하고 6차까지 "커밋할 때 341을 494로 고칠 것"이라 적어 둔 그 숫자는 **파일에 더 이상 없다.** 현재 `ci.yml:7-10`은 *"(No count is quoted here on purpose: an earlier draft of this comment cited 341, a number that matched no measurement this repo ever recorded. The current figure lives in docs/feature-status.md §검증 방법, next to the date it was measured.)"* 로, 이 문서가 권고한 **"수치 대신 §검증 방법을 가리키게 하라"는 개선안까지 그대로 적용돼 있다.** 실측 테스트 수는 §검증 방법을 볼 것(2026-08-12 재실측 web 269 + pipeline 225 = 494) |
| 단계 체크포인트 · 중단 지점 재개 | a1 §2 "어느 단계에서 죽어도 마지막 성공 지점부터 재개"(a1-architecture.md:102) | △ | 코드 + 단위 테스트 | **2026-08-12 신규 등재.** `pipeline/src/storage/checkpointFile.ts`(신규) + `storage/adapter.ts:62-68`(`saveCheckpoint`/조회/삭제) + `index.ts`의 `RESUME` 환경변수(`const resume = !["false","0","no"].includes(…RESUME…)` `:121` — **2026-08-12 7차 재실측**, 이전 판의 `:116`은 5줄 어긋나 있었다. 기본 on, `RESUME=false`로 끔). 재개된 단계는 두 곳에 로그를 남긴다: `run.ts`가 실행 중에 영문 `[pipeline] stage=<이름> skipped — resumed from checkpoint`를 찍고 그 단계의 `detail.resumedFromCheckpoint`를 `true`로 기록하며, `index.ts`가 실행 끝의 단계 요약에서 그 플래그를 읽어 한국어 `(체크포인트에서 재개 — 재실행 안 함)`을 덧붙인다(`const resumedNote = s.detail?.resumedFromCheckpoint ? …`). **2026-08-12 정정 — 2026-08-11 판은 한국어 문구를 `run.ts`가 찍는다고 적었으나 그 문구는 `index.ts`에 있다**(기능은 존재하고 파일 귀속만 틀렸다). 단위 테스트 `resume.test.ts`. **△인 이유 (2026-08-12 3차 보강)**: (a) 실제로 중단된 실행을 재개해 본 기록이 없다 — 확인 근거가 테스트뿐이다. (b) ~~설계와 구현이 다르다~~ **→ 2026-08-12 해소.** 이 자리에는 "a1 §2는 **DB에** 상태를 남긴다고 적었는데 체크포인트는 `checkpointFile.ts`의 로컬 JSON 파일이고 Supabase 어댑터도 그 파일 함수를 그대로 임포트한다 → GitHub Actions 에서는 같은 job 안의 재시도만 재개된다"고 적혀 있었다. 지금은 Supabase 어댑터가 `pipeline_checkpoints` 테이블에 쓴다(`supabase/migrations/0005_pipeline_checkpoints.sql` 신규 · `storage/supabase.ts`의 `saveCheckpoint`/`loadCheckpoint`/`clearCheckpoint`). 재개 유효기간 상수는 `storage/adapter.ts`의 `CHECKPOINT_MAX_AGE_HOURS` 한 곳으로 모았다 — 재개하는 쪽(`run.ts`)과 만료 행을 지우는 쪽(어댑터)이 서로 다른 값을 쓰면 아직 쓸 수 있는 체크포인트를 지우게 된다. `checkpointFile.ts`는 LocalFile 어댑터 전용으로 남았다. 단위 테스트는 `storage/supabase.test.ts`의 "checkpoints outlive the runner" 8건. 단계용 `status` 컬럼은 여전히 없다 — 단계 진행은 `payload` 안에 어느 단계 키가 채워졌는가로 표현된다. a1 §1·§1.3·§2·§5·§6과 `DEPLOYMENT.md` 1단계, `README.md` supabase 절을 그에 맞게 고쳤다 |
| 반려 기사 재생성 배치 | production §2(반려) | △ | 코드 + 단위 테스트 | **2026-08-12 신규 등재.** 검수 콘솔이 "반려(재생성 요청)"로 표시한 기사를 다시 쓰는 배치. `pipeline/src/pipeline/regenerate.ts` + `src/scripts/run-regenerate.ts` + `package.json`의 `npm run regenerate -- <날짜>`. 검수 화면이 운영자에게 이 명령을 안내한다(`ReviewClient.tsx:194`). 단위 테스트 `regenerate.test.ts`(대기 목록 추출·재생성). **△인 이유: 실제로 반려 → 재생성 → 재검수까지 한 바퀴 돌려 본 기록이 없다.** 또한 콘솔이 파이프라인을 직접 호출하지는 않는다 — 사람이 터미널에서 명령을 실행하는 반자동 경로다 |
| GitHub Actions 일일 스케줄(cron) | §3-1 | ❌ | `.github/workflows/daily-pipeline.yml:25-26`(`# schedule:` / `#   - cron: "0 20 * * *"`, 중단 사유는 바로 위 `:18-24` 주석) | **cron이 주석 처리돼 있어 자동 실행이 꺼져 있다**(커밋 `df71e3b` "pause the nightly cron" — 1회 약 $1.04를 아무도 안 보는 산출물에 쓰지 않기 위한 의도적 중단). 주석 해제 전까지 매일 자동 발행은 없다. 참고: 중단 이전에 스케줄이 1회 발동했고 **실패**했다(2026-08-10T22:07Z, 22초 만에 failure) |
| 운영자 검수 콘솔 (승인 화면) | production §2, enhancement B2 #8 | ✅ | 코드 + 테스트 | **2026-08-11 구현 완료**(커밋 `cb67b60`·`8f599fd`). `web/src/app/admin/page.tsx`(에디션 목록) · `admin/[date]/page.tsx`(검수 화면) · `admin/login/page.tsx`(운영자 로그인) · `admin/actions.ts`(서버 액션 **8개**: 승인 `:14` · 제외 `:26` · **반려(재생성 요청) `:56`** · 결정 초기화 `:75` · 발행 `:95` · 로그아웃 `:110` · 리드 기사 지정 `:122` · 일괄 승인 `:149` — 2026-08-11 판은 반려를 빠뜨리고 7개로 적었다) · `web/src/lib/admin/publishEdition.ts`(승인분을 웹 시드로 발행). ⚠️ 지금은 `pipeline/output/`을 직접 읽는 **로컬 fs 리포지토리**라 Vercel에서는 못 쓴다 — Supabase 리포지토리 구현이 남았다 |

## 1-B. 읽기 경험

> ⚠️ **2026-08-11 — 기본 스킨이 바뀌었다.** 아래 표의 "실화면" 판정은 대부분 a3-ui-ux.md의 표준 스킨(☕ BRIEFLY 헤더 + 인사말 + 카테고리 칩)을 2026-07-17에 확인한 기록이다. 지금 기본으로 뜨는 화면은 **1902년 신문(뉴스프린트) 스킨**이고, 표준 스킨은 다크 모드 폴백으로 밀렸다(커밋 `c95660e`). 각 기능이 뉴스프린트 스킨에서도 같은 방식으로 동작하는지는 전수 재확인하지 않았다 — §2 G13 참조.

| 기능 | 계획 출처 | 상태 | 확인 방법 | 비고 |
|---|---|---|---|---|
| **뉴스프린트 스킨(기본 UI)** | 커밋 `c95660e` (a3 미반영) | △ | 코드 + 단위 테스트 | `web/src/components/newsprint/useNewsprintSkin.ts`의 `useNewsprintSkin()`(선언 `export function useNewsprintSkin(): boolean {` `:19`, 판정 `const isDark = hydrated && (theme === "dark" || (theme === "system" && systemDark));` `:23`, 반환 `return !isDark;` `:24`)이 **다크 모드가 아닌 모든 경우 true**를 반환하고, `Skinned*View.tsx`가 그때 `NewsprintFrontPage`(모바일)/`NewsprintBroadsheet`(데스크톱)를 렌더한다. 홈·기사·아카이브·My·설정 5화면 모두 스킨 버전이 있다. 라이트 전용 설계 — 다크 모드는 표준 스킨으로 폴백. **설계 근거가 a3-ui-ux.md에 아직 없다**(핸드오프 문서만 존재) |
| 기사 컷(제목 이미지) | `docs/newsprint-cuts/README.md` | △ | 코드 + 파일 | `web/public/newsprint/cuts/<article-id>.png`를 놓으면 해당 기사 각인 슬롯에 렌더. 데이터 모델 필드·업로드 단계 없음. 현재 실제 컷은 1장(`article-2026-07-13-4.png`)뿐이고 나머지는 플레이스홀더. 컷은 하루 lead 1건에만 붙고, 렌더될 때 news-sourcing §3 고지(`chrome.tsx` `ILLUSTRATION_NOTICE`, `:129` 선언 → `:240` 렌더)가 캡션에 함께 나온다 — §1-E "보도사진 미사용" 행과 짝 |
| Today's Top 10 홈 | brief §9·§16, a3 §2-1 | ✅ | 실화면 | 카드 10개 노출 |
| 인사말·날짜·총 읽기시간·현재 레벨 | a3 §2-1, §3-4 | △ | 실화면(표준 스킨) + 코드(뉴스프린트) | **2026-08-12 정정 — 표준 스킨에서만 동작한다.** "Good Evening, Ryan." 시간대 인사와 레벨 변경 시 총 시간 재계산(A2 20분 → B1 30분)은 2026-07-17 실화면 확인 기록이다. 그러나 "Good Evening" 문자열은 `web/src/components/GreetingBlock.tsx:17`에만 있고 이 컴포넌트는 **표준 스킨 전용**이다 — 지금 기본 화면인 뉴스프린트 홈(`NewsprintFrontPage.tsx`)의 헤더에는 인사말·총 읽기시간·현재 레벨이 **아예 없다**(설정 아이콘 / `Nameplate` / 아카이브 아이콘 3개뿐). 4요소 중 날짜만 폴리오 라인(`chrome.tsx`의 `FolioLine` ← `formatFolioDate`)으로 남아 있다. `useNewsprintSkin()`이 다크 모드가 아닌 모든 경우 `true`를 반환하므로 **라이트·시스템 사용자는 인사말 없는 화면을 본다** — G13 |
| 카테고리 요약 칩 | a3 §2-1 | ✅ | 실화면(표준 스킨) + 코드(뉴스프린트) | 표준 스킨: 가로 스크롤 요약 칩, 필터 없음(2026-07-17 실화면). **2026-08-12 정정 — 기본 화면인 뉴스프린트 스킨에서는 이미 필터로 동작한다**: `NewsprintFrontPage.tsx`의 섹션 스트립 버튼이 `onClick`에서 `setSection(entry.slug)`를 호출하고 `listRef`로 필터된 목록까지 스크롤한다. 2026-08-11 판의 "탭 필터는 후속 예정"은 표준 스킨 기준의 낡은 서술이었다 — 구현이 문서를 앞질렀다. 단 뉴스프린트 쪽은 **코드 확인이고 실화면 재확인은 하지 않았다** |
| 기사 카드(카테고리·레벨 배지·읽기시간·프리뷰·읽음) | a3 §2-1 | ✅ | 실화면 | 읽은 기사에 "✓ 읽음" 표시 확인 |
| 기사 뷰어 · sticky 레벨 스위처 A2/B1/B2 | brief §9, a3 §2-2 | ✅ | 실화면 | `role="tablist"`, 전환 시 본문 교체 + URL `?level=` 반영 확인 |
| 레벨 스위처 Original 칸 | brief §9 | 🔒 | 문서 §4-7 | MVP는 3칸. 원문은 하단 출처 링크로 갈음 |
| 본문 모든 단어 클릭 가능 | §4.8-1 | ✅ | 실화면 | A2 본문 기준 클릭 가능 단어 167개 |
| Smart Dictionary — IPA·뜻·기사 속 예문·저장 | a3 §2-3 | △ | 코드 + 스키마 | 큐레이션 단어는 IPA + 뜻 + "In this story:" 예문 정상. **품사 경로는 2026-07-17에 뚫렸다** — `web/src/lib/types.ts:147`에 `pos?: string \| null`, `supabase/migrations/0004`가 `words.pos` 컬럼 추가, 재작성 프롬프트가 `pos`를 required로 요구. 다만 **기존 시드 단어에는 품사 값이 없고 백필하지 않았다**(값을 지어내지 않는 원칙) — 화면은 있으면 보여주고 없으면 생략한다. 유의어·표현은 후속 |
| 사전 발음 재생(🔊) | a3 §2-3 | 🔒 | 문서 §4-4 | IPA 표기만, TTS 재생은 V1.5 |
| 사전 미등록 단어 최소 카드 | §4.8-1 | ✅ | 실화면 | "뜻 준비 중이에요" + 주 버튼 "단어장에 저장" → "저장됨 ✓" |
| 조회한 단어 점선 표시 | a3 §3-2 | ✅ | 실화면 | 재방문 시 `1px dotted` 확인 |
| 저장한 단어 본문 구분 표시 | §4.7 | ✅ | 실화면 | 배경 강조 확인 |
| 핵심 단어 인라인 뜻(루비) | §4.8-3 | ✅ | 실화면 | 본문에 "settlers정착민", "detained억류된, 붙잡힌" 렌더. 기사 내 첫 등장만 |
| Words in this story 단어 목록 | a3 §2-2 | ✅ | 실화면 + 시드 실측 | **2026-08-12 시드 실측 정정**: `web/src/lib/data/seed/words.json`은 버전 30개에 단어 **153개** — 27개 버전이 5개, **3개 버전이 6개**(`version-2026-07-13-3-a2` · `-4-b1` · `-5-a2`). 즉 min 5 / max 6이다. 2026-08-11 판의 "레벨당 5개"는 반올림한 서술이었다 |
| 글자 크기 S/M/L/XL | a3 §3-4 | ✅ | 실화면 | XL 선택 시 `--reading-scale: 1.25` 적용 확인 |
| 테마 토글(라이트/다크/시스템) | a3 §0 | ✅ | 실화면 | `data-theme` stamp 확인 |
| 북마크(스크랩) 토글 | a3 §2-2 | ✅ | 실화면 | `aria-pressed` 전환 확인 |
| 읽음 처리(90% 또는 30초+50%) | a3 §3-3 | ✅ | 실화면 | 스크롤 시 진행 표시가 0/10 → 1/10 |
| 문장 저장 | §4.7 | ✅ | 실화면 | 단어 스팬 외 영역 탭 → "🖊️ 문장 저장" 팝오버 |
| 출처 섹션(복수 링크 + 고지) | a3 §2-2, brief §14 | ✅ | 실화면 | 외부 링크 `target=_blank rel=noopener` |
| 로딩 스켈레톤 / 빈 상태 / 에러 | a3 §3-4 | ✅ | 실화면 + 코드 | 홈 스켈레톤 5개, "오늘의 브리핑을 준비하고 있어요" 등 |
| 반응형(모바일/데스크톱 사이드 네비) | a3 §4-2 | ✅ | 실화면 | 1280px에서 사이드 네비 노출, 가로 스크롤 없음 |
| 접근성 — tablist/dialog aria-modal/lang="en"/포커스 | a3 §4-1 | ✅ | 실화면 + 코드 | 2026-07-17에 마지막 미달 항목 해결 — `web/src/components/FontSizePopover.tsx:25`에 `if (e.key === "Escape") setOpen(false)` 배선(팝오버가 열려 있는 동안만 리스너 부착). 뉴스프린트 스킨의 접근성은 미재확인 |
| Sentence Compare(같은 문장 3레벨 비교) | brief §9 | 🔒 | production §7 | V1.5 |
| 퀴즈 섹션 | brief §9, a3 §2-2 | 🔒 | §4.5 | MVP 제외 (사용자 지시) |

## 1-C. 학습 데이터

| 기능 | 계획 출처 | 상태 | 확인 방법 | 비고 |
|---|---|---|---|---|
| My 페이지 3서랍(스크랩/단어장/문장) | §4.7 | ✅ | 실화면 | 탭 3개 + 개수 배지. 경로는 `/saved` 유지 |
| 프로필 요약(레벨·읽은 기사·저장 수) | §4.7 | ✅ | 실화면 | 게스트/이름, 읽은 기사 10·스크랩·단어·문장 카운트 |
| 단어장 "뜻 미등록" 표시 | §4.8-1 | ✅ | 실화면 | 뜻 없이 저장한 단어가 "뜻 미등록"으로 표시, 지어내지 않음 |
| 저장 문장 + 출처 기사 링크 | §4.7 | ✅ | 실화면 | 문장 서랍에서 확인 |
| 세션 저장소(localStorage) | §4.7 | ✅ | 실화면 | `briefly:session:v1` 단일 키 |
| saved_sentences 스키마 | §4.7 | ✅ | `supabase/migrations/0002_user_library.sql` | RLS 포함. 테이블은 실 DB에 만들어졌지만(마이그레이션 적용됨), **인증이 없어 아직 쓰이지 않는다** — 저장 문장은 여전히 localStorage에만 있다 |
| 기기 간 동기화(Supabase 이관) | production §3 | ❌ | 코드 | 인터페이스만 준비 |
| 복습 시스템 / 저녁 알림 | brief §9 | 🔒 | enhancement 범위 제외 | 학습 기능 확장은 사용자 별도 구상 |
| AI Tutor / 쉐도잉(TTS) / 관심사 큐레이션 / Progress | brief §9 | 🔒 | brief §16, production §7 | V1.5~V2 |

## 1-D. 리추얼·편의

| 기능 | 계획 출처 | 상태 | 확인 방법 | 비고 |
|---|---|---|---|---|
| 연속 읽기 "다음 기사 →" | enhancement B1 #2 | ✅ | 실화면 | 본문 끝에 다음 기사 카드 |
| 오늘 진행 N/10 | enhancement B1 #2 | ✅ | 실화면 | 레벨 스위처 옆 |
| 완주 화면 "오늘의 브리핑 끝!" | enhancement B1 #3 | ✅ | 실화면 | 10개 모두 읽고 마지막 기사에서 노출 확인 |
| 연속 출석 표시 | enhancement B1 #3 | ✅ | 실화면 | "🔥 1일 연속으로 브리핑을 읽고 있어요" (압박 없는 톤) |
| 나의 주간 브리핑 | enhancement B1 #3 | ✅ | 실화면 | 읽은 기사/새 단어/저장 문장 수. 시각 기록 없는 과거 데이터는 집계에서 제외(추정 금지) |
| 아카이브 목록 + 날짜별 열람 | enhancement B1 #4 | ✅ | 실화면 | `/archive`, `/archive/2026-07-13`. 없는 날짜는 404 |
| 홈 → "지난 브리핑 보기" | enhancement B1 #4 | ✅ | 실화면 | 홈 하단 링크 |
| 온보딩 3단계(자기 진단) | a3 §2-4 | △ | 실화면 | 이름 입력 → 레벨 샘플 3개 선택 → 완료 → 홈이 선택 레벨로 열림. **Step 1의 소셜/이메일 가입은 없음**(로그인 미도입 상태를 화면에 정직하게 고지) |
| 온보딩 비강제 + 홈 배너 유도 | §4.6 | ✅ | 실화면 | "1분 레벨 진단하기" 배너, 닫기 가능. 기본 레벨 A2 |
| 온보딩 샘플을 실제 기사에서 가져오기 | a3 §2-4 | ✅ | 실화면 | 1번 기사의 A2/B1/B2 실제 본문 사용(하드코딩 아님) |
| Settings(레벨·글자크기·테마·신뢰 링크) | a3 | ✅ | 실화면 | 로그인 미도입 사실을 화면에 고지 |
| PWA 설치 | enhancement B2 #5 | ❌ | 코드 | manifest 없음 |
| 기사별 OG 메타 | enhancement B2 #6 | ✅ | 코드 | `web/src/app/article/[slug]/page.tsx:48`에 `export async function generateMetadata()` — 기사별 메타 생성. OG **이미지** 생성은 아직 없음 |
| 공유 버튼 | enhancement B2 #6 | ❌ | 코드 | 없음 |
| 검색(기사·단어장) | enhancement B2 #7 | ❌ | 코드 | 없음 |
| 아침 알림(푸시/뉴스레터) | production §6 | ❌ | 코드 | 없음 |

## 1-E. 신뢰

| 기능 | 계획 출처 | 상태 | 확인 방법 | 비고 |
|---|---|---|---|---|
| 기사 하단 교차 확인 고지 | enhancement B1 #1 | ✅ | 코드 + 테스트 | **2026-07-17 dedup 적용(G2 해결).** `web/src/lib/sourceOutlets.ts`의 `groupSourcesByOutlet()`이 같은 매체의 다른 피드를 한 줄로 묶는다 — `SourcesSection.tsx:24`가 이 값을 쓴다 |
| 카드·뷰어 "소스 N" 배지 | enhancement B1 #1 | ✅ | 코드 + 테스트 | 같은 모듈의 `countUniqueOutlets()`를 `ArticleCard.tsx:90`·`ArticleViewer.tsx:190`·뉴스프린트 스킨(`NewsprintBroadsheet.tsx:380`, `NewsprintArticleViewer.tsx:289,303`)이 모두 사용 |
| /about "우리가 뉴스를 만드는 방법" | enhancement B1 #1 | ✅ | 실화면 | 수집→교차 확인→레벨별 재작성→사람 검수 4단계 설명 |
| 복수 출처 링크 하단 표기 | a3 §2-2, r2 | ✅ | 실화면 | |
| 원문 미게재 · 제목 재작성 · **보도사진** 미사용 | brief §14, news-sourcing §3 | ✅ | 산출물 + 코드 | **2026-08-12 정정 — "이미지 없음"은 더 이상 사실이 아니다.** 원문 미게재·제목이 원문과 다른 재작성 제목은 산출물 실측 그대로다. 그러나 기본 스킨은 이제 이미지를 렌더한다 — `newsprint/chrome.tsx`의 컷 슬롯이 `web/public/newsprint/cuts/<article-id>.png`를 `<img>`로 그리고, 실제 파일이 1장 있다(lead 기사 `article-2026-07-13-4`, rank 1). 이 행이 "이미지 없음"이라고 적는 동안 §1-B "기사 컷" 행은 컷이 렌더된다고 적고 있어, 한 문서가 서로 다른 말을 하고 있었다. **정확한 사실**: 렌더되는 이미지는 보도사진이 아니라 AI 일러스트(engraving)이고 **하루 lead 1건에만 붙는다**(`chrome.tsx` 주석 "ONLY THE DAY'S LEAD CARRIES A CUT"), news-sourcing §3이 요구한 고지 `ILLUSTRATION_NOTICE`("일러스트이며 실제 보도사진이 아닙니다.", `chrome.tsx:129`)가 컷이 있을 때만 `<figcaption>` 안에 함께 렌더된다(`chrome.tsx:240`). 즉 **보도사진 미사용 원칙은 지켜지고 고지 경로도 있다.** 단 고지 렌더는 **코드 확인이고 실화면 재확인은 하지 않았다** — 뉴스프린트 스킨 실화면 전수 재확인(G13)에 포함시킬 것 |
| provenance 내부 전용(사용자 노출 안 함) | §2-1 | ✅ | 코드 | facts/fact_sources는 데이터에만 존재, 화면 노출 없음 |
| 자동 발행 금지(사람 승인 후 발행) | production §2 | ✅ | 코드 + 테스트 | 코드는 자동 발행을 막고 `review`(게이트 미통과분은 `held`) 상태로 둔다. **2026-08-11부터 승인 경로가 실제로 존재한다** — `/admin`에서 승인 → `publishEdition.ts`가 승인분만 웹 시드로 발행 |
| 저작권 변호사 자문 | brief §14, production §4 | ❌ | 문서 | 미착수 |

## 1-F. 운영·인프라

| 기능 | 계획 출처 | 상태 | 확인 방법 | 비고 |
|---|---|---|---|---|
| Supabase 프로젝트 실연결 (파이프라인 쓰기) | production §1 | ✅ | Actions 로그 | 프로젝트 생성·마이그레이션 적용·시크릿 등록 완료. 2026-08-11 run `31493703937`에서 기사 1건 실제 기록(연결 자체는 확인됨). ⚠️ 그 실행은 `MAX_ARTICLES=2`였고 최종 결론은 **cancelled**였다 — 에디션 전체를 쓴 실행은 아직 없다(1-A "저장소 — Supabase 어댑터" △ 참조) |
| Supabase 실연결 (웹 읽기) | production §1 | ❌ | 코드 | `web/src/lib/data/`는 여전히 시드 JSON만 읽는다. 파이프라인이 DB에 써도 웹사이트에 반영되지 않는다 |
| Anthropic API 키 · 비용 실측 | production §1 | ✅ | 산출물 | 실제 호출 발생. 1회 실행 실측 **$1.0366** (`pipeline/output/runs/9ff5ad29-….json` `costSummary.estimatedUsd`) |
| 인증(이메일·Google) | production §3 | ❌ | 코드 | |
| 회원 탈퇴·데이터 삭제 | production §3 | ❌ | 코드 | |
| GitHub 리포지토리 | production §1 | ✅ | `.git/config` + Actions | `https://github.com/ryankoyu/newsboy.git`. Actions 실행 이력 5건(success 1/failure 3/cancelled 1), 시크릿 등록 완료. ⚠️ 2026-08-12 현재 **로컬에 커밋되지 않은 변경이 다수 남아 있어**, 리포에 있는 코드와 이 문서가 서술하는 코드가 다르다 — §2 G14 |
| 도메인·Vercel 배포 | production §1 | ❌ | — | 미착수 |
| 파이프라인 실패 알림 | production §5 | ❌ | 워크플로 | 실패 시 알림 단계 없음 |
| 에러/업타임 모니터링, DB 백업, 소스 헬스체크 | production §5 | ❌ | — | |
| SEO — 기사별 OG 메타 | production §6 | ✅ | 코드 | `article/[slug]/page.tsx:48` `generateMetadata` |
| SEO — sitemap / OG 이미지 / 방문 분석 | production §6 | ❌ | 코드 | 없음 |
| 이용약관·개인정보처리방침 | production §4 | ❌ | — | |
| 테스트 안전망 | enhancement 원칙 | ✅ | 실행 | web 269 + pipeline 225 = **494개 통과** (2026-08-12 6차 재실측). web은 `npm test`로 실행할 것 — §검증 방법 주의 참조. ⚠️ 아직 **CI에서 도는 안전망은 아니다** — `ci.yml`이 커밋되기 전까지 이 숫자는 "누군가 그날 로컬에서 돌렸을 때만" 참이다 |

### 판정 집계

인벤토리 102행 기준 (2026-08-12 실측).

| ✅ 구현·확인 | △ 부분 구현 | ❌ 미구현 | 🔒 의도적 보류 |
|---|---|---|---|
| 62 | 18 | 15 | 7 |

- 2026-08-11 판(99행 / 64·12·16·7)에서 바뀐 것: **Layer 3 편집회의 ❌ → △**(구현·배선 확인), **Supabase 어댑터 ✅ → △**(쓰기는 봤지만 그 실행이 cancelled로 끝났고 에디션 전체를 쓴 적이 없음), **인사말·날짜·총 읽기시간·현재 레벨 ✅ → △**(2026-08-12 — 인사말·총 시간·레벨이 표준 스킨에만 있고 기본 화면인 뉴스프린트 홈에는 없다), 신규 3행(**CI 워크플로 △**, **체크포인트 재개 △**, **반려 재생성 배치 △**).
- 🔒 7행은 표에서 여러 기능을 한 줄로 묶은 경우가 있어(예: AI Tutor·쉐도잉·관심사 큐레이션·Progress) 실제 보류 **항목**은 §3의 9개다.
- ❌ 15개 중 12개는 production-readiness.md가 이미 "출시 전/직후 필요"로 분류한 인프라·운영 항목이다(웹 Supabase 읽기, 인증, 탈퇴, 도메인·Vercel, 실패 알림, 모니터링, sitemap·분석, 약관, 저작권 자문, 아침 알림, 기기 간 동기화, 일일 cron).
- 순수하게 "계획했는데 아직 빠진" 기능 갭은 **PWA(#5)**, **공유 버튼(#6)**, **검색(#7)** **3개**다. Layer 3 편집회의는 구현됐으므로 이 목록에서 뺐다. 나머지 3개는 2026-08-12에 다시 확인했다 — `web/` 어디에도 manifest 파일이 없고, `navigator.share` 호출이 없고, 검색 라우트·컴포넌트가 없다.
- 이 표의 △가 12 → 18로 는 것은 기능이 후퇴해서가 아니라, **"코드는 있는데 실제 동작을 아직 못 본 것"과 "기본 화면에서는 안 보이는 것"을 ✅로 올리지 않고 △에 세웠기 때문**이다. §4-2 규칙(실제로 동작을 봤을 때만 ✅)을 새 기능 3건·Supabase 어댑터·인사말 블록에 그대로 적용한 결과다.

---

# 2. 발견된 갭·결함 (심각도순)

> §4-4 규칙: 갭을 고쳐도 지우지 않고 **해결 표시와 날짜**를 남긴다. 2026-08-11 갱신에서 G1·G2·G4·G5·G6·G9·G10·G11 8건에 이 표시를 소급해 붙였다 — 코드는 고쳐졌는데 이 문서만 갱신되지 않아, 다음 사람이 "미구현"으로 읽는 상태가 이어지고 있었다.

### ~~G1. 운영자 검수 콘솔이 없어 "발행"이 구조적으로 불가능~~ ✅ **해결 (2026-08-11)** 🔴
**해결**: 검수 콘솔이 구현됐다(커밋 `cb67b60`·`8f599fd`). `web/src/app/admin/page.tsx`(에디션 목록) · `admin/[date]/page.tsx`(검수 화면) · `admin/login/page.tsx` · `admin/actions.ts`(승인·제외·결정 초기화·발행·로그아웃·리드 기사 지정·일괄 승인 7개 서버 액션) · `web/src/lib/admin/publishEdition.ts`(승인분을 웹 시드로 발행) · `web/src/lib/admin/auth.ts`(운영자 로그인).
**남은 것**: 리포지토리가 `pipeline/output/`을 직접 읽는 로컬 fs 구현이라 Vercel에서는 못 쓴다(안내 화면으로 처리). Supabase 리포지토리 구현이 남았고, 이것이 지금의 실질적 발행 병목이다.

*(원문 기록) 파이프라인은 자동 발행 금지 원칙에 따라 기사를 `status: "review"`, 에디션을 `status: "draft"`로 저장하고 사람이 웹 화면에서 승인하는 것을 전제로 설계돼 있는데, `web/src/app`에 admin 계열 경로가 하나도 없어 발행 경로 자체가 없었다.*

### ~~G2. 신뢰 고지가 매체 수를 부풀린다~~ ✅ **해결 (2026-07-17)** 🔴
**해결**: `web/src/lib/sourceOutlets.ts`가 신설되어 `groupSourcesByOutlet()`(같은 매체의 다른 피드를 한 줄로 묶음)과 `countUniqueOutlets()`를 제공하고, 표시단이 전부 이 함수를 쓴다 — `SourcesSection.tsx:24`, `ArticleCard.tsx:90`, `ArticleViewer.tsx:190`, 그리고 뉴스프린트 스킨의 `NewsprintBroadsheet.tsx:380`·`NewsprintArticleViewer.tsx:159,289,303`. 파이프라인의 `outletKey` 규칙과 표시단이 이제 같은 기준을 쓴다.

*(원문 기록) `SourcesSection.tsx`가 `sources.length`(피드 행 수)를 그대로 세어 "N개 매체에서 교차 확인"이라고 썼다. 1번 기사가 `The Guardian World`를 두 번 나열하면서 "6개 매체"로 표시하는 식으로, 시드 10건 중 4건이 같은 문제였다. enhancement-plan.md의 "신뢰 고지 문구는 사실만 — 과장 금지"를 정면으로 어기는 지점이었다.*

### G3. 웹 시드 에디션의 카테고리 구성이 계획 쿼터를 어긴다 🟠 (일부 해결, 2026-08-11 재확인)
**부분 해결**: 시드는 커밋 `904f9ff`로 2026-07-13 에디션의 **실제 파이프라인 산출물 10건**으로 갱신됐고(예시·목업 데이터 아님), B2 분량도 451~516단어로 재생성됐다(G6 해결).
**남은 문제**: 카테고리 구성은 여전히 **World 5 / Korea 2 / AI 2 / Culture 1**(`articles.json` 실측)로, 계획 쿼터(World 3/Korea 2/AI·Tech 2/Business 2/Culture·Sports 1)를 어기고 Business·Tech·Sports가 0이다. 쿼터 로직을 적용한 에디션이 아직 웹 시드로 올라오지 않았다 — 지금 화면을 여는 사람은 편중된 구성을 본다.

### ~~G4. 같은 에디션을 홈은 "오늘", 뷰어는 "지난 브리핑"이라고 말한다~~ ✅ **해결 (2026-07-17)** 🟠
**해결**: 날짜 판정이 `web/src/lib/editionDate.ts` 한 곳으로 모였고(`editionDate.test.ts` 동반), 홈과 뷰어가 같은 함수를 쓴다. 발행이 밀려도 두 화면이 같은 말을 한다.

*(원문 기록) 홈은 최신 에디션을 날짜 비교 없이 "오늘 꼭 알아야 할 뉴스 10개"로 소개하고, 뷰어는 `edition_date !== 오늘`이면 "2026년 7월 13일 브리핑" 라벨을 붙였다.*

### ~~G5. World 지역 분산 룰이 구현되지 않았다 (데드 코드 포함)~~ ✅ **해결 (2026-07-17)** 🟠
**해결**: `selectTop10.ts:272`가 world 카테고리에 한해 `fillWorldQuotaWithRegionSpread()`를 호출하고, 이 함수(같은 파일 412행 정의)가 `rules.ts`의 `regionOf()`로 이미 쓴 지역을 피해 남은 슬롯을 채운다. `regionOf()`는 더 이상 데드 코드가 아니다.
**남은 한계**: 지역 판정이 여전히 "보도한 매체의 국적" 추정 기반이라, 미국 매체가 보도한 유럽 사건은 아메리카로 계산된다(함수 앞 주석 400~411행에 자기 한계로 명시). 이 한계는 §1-A의 △ 판정으로 남겨 뒀다.
**줄 번호 정정 (2026-08-12)**: 위 줄 번호는 원래 210 / 346~366 / 339~344로 적혀 있었는데, 그 뒤 같은 파일이 크게 늘어나(Layer 2·3 추가) 그 위치가 전혀 다른 코드를 가리키게 됐다. 다음 사람이 대조에 실패하지 않도록 현재 트리 기준으로 다시 실측했다. **교훈: `파일:줄`을 근거로 쓸 때는 함수·심볼 이름을 함께 적을 것** — 줄 번호만 남기면 코드가 조금만 움직여도 문서가 거짓이 된다.

### ~~G6. B2 분량이 전 기사에서 목표에 미달한다~~ ✅ **해결 (2026-07-17)** 🟠
**해결**: `pipeline/src/gates/wordCount.ts` 게이트를 신설하고 `supabase/migrations/0001_schema.sql:13`의 `check_kind` enum에 `'word_count'`를 추가해, 분량 미달이 게이트에서 실제로 걸리게 했다. 이후 재생성된 웹 시드의 B2 10건은 **451~516단어로 전부 하한(450) 충족**(`article_versions.json` 실측). 레벨별 문단 계획을 공유하는 개선은 커밋 `2fb3dea`.

*(원문 기록) 07-14 산출물의 B2 10건이 334~447단어로 전부 하한 미달(평균 약 407)이었고 1건은 CEFR 게이트에서 실패(338단어)했다. 재작성 3회 재시도로도 분량이 올라오지 않았다.*

### ~~G7. Top10 점수화가 계획의 절반만 돌고 있다~~ ✅ **코드 해결 (2026-08-12 확인)** / 실행 확인은 남음 🟠
**해결**: Layer 2의 6신호 + 감점이 전부 구현·배선됐고(`score.ts`의 `ScoreBreakdown` `:31-43`(`globalImpact:37`/`learnability:39`/`demerit:41`) · 외부 신호 입력 타입 `ExternalSignals` `:46-50` · `WEIGHTS` `:52-66`(`globalImpact:60`/`learnability:63`/`demerit:65`) · 합산 `:100-118` — **줄 범위는 2026-08-12 4차 재실측**, 이전 판의 `51-63`은 `demerit` 줄을 빠뜨렸다. **심볼명은 6차 정정** — `ScoreInputs`라는 타입은 `pipeline/src/`에 존재하지 않는다(`grep -rn ScoreInputs src/` 무결과). GDELT 신호는 `pipeline/globalImpact.ts`의 `createGdeltGlobalImpactProvider`를 `index.ts`에서 주입 — import `:61` · `const gdeltOn` `:122` · 생성 `:123-125` · 주입 `globalImpact,` `:141`, **2026-08-12 7차 재실측**), Layer 3 편집회의도 구현돼 **선정 전에** 호출된다(`selectTop10.ts`의 `runEditorialMeeting()`, 선언 `:631` → 상위 28 후보를 `llm.selectTop10()`에 넘기고, 응답 순위를 `llmProposedRank`로 기록해 Layer 1 쿼터가 그 순서대로 채운다). 코드 주석(`selectTop10.ts:626-630`)이 "이전에는 같은 호출을 선정 **뒤에** 해서 답을 rationale 문구로만 썼다"고 과거형으로 남겨 뒀다 — 즉 이 문서가 "미구현"이라고 적고 있던 상태가 바로 그 과거다. 단위 테스트 `pipeline/src/pipeline/layer2Layer3.test.ts`.
**남은 것**: 실행 산출물 확인. `output/`의 어떤 에디션·선정 리포트에도 `globalImpact`/`llmProposedRank`가 없다 — 이 코드가 붙은 뒤로 파이프라인을 끝까지 돌린 적이 없기 때문이다. 그래서 §1-A의 두 행은 ✅가 아니라 △다. **다음 실행 때 확인할 것**: (a) GDELT 호출이 429가 아니라 실제 국가 수를 돌려주는지, (b) 편집회의 제안이 실제로 순위를 바꿨는지(선정 리포트의 `llmProposedRank`와 최종 순위 대조), (c) 두 신호가 늘린 비용(Haiku 학습적합성 호출 + Sonnet 편집회의)이 얼마인지.

*(원문 기록) Layer 2의 6개 신호 중 4개만 구현됐다. GDELT 글로벌 영향력과 LLM 학습 적합성·감점이 없다. Layer 3(LLM 편집회의)은 아예 없고, LLM은 이미 확정된 10개에 선정 사유 문구만 붙여준다.*

### G8. 강화된 2소스 게이트로 재실행하면 현재 기사 대부분이 탈락한다 🟡
07-14 에디션은 사실 단위 강화 이전 코드의 산출물이다. 지금 기준(본문 기여 사실 최소 3개)을 적용하면 10건 중 **7건**이 보류·교체 대상이다(rank 7은 본문 기여 사실 0건인데 통과해 있다). 코드는 옳고 산출물이 낡은 것이지만, "지금 파이프라인을 돌리면 10개를 채울 수 있는가"라는 실질적 위험이 남아 있다.

### ~~G9. Smart Dictionary에 품사 표기가 없다~~ ✅ **경로 해결 (2026-07-17)** 🟡
**해결**: 스펙과 데이터 모델을 데이터 모델 쪽으로 정리했다. `web/src/lib/types.ts:147`에 `pos?: string | null`, `supabase/migrations/0004_words_pos_and_categories_seed.sql`이 `words.pos` 컬럼(nullable)을 추가, 재작성 프롬프트가 `pos`를 required로 요구한다.
**남은 것**: 이 컬럼 이전에 생성된 기존 시드 단어에는 품사 값이 **없고, 백필하지 않았다** — 없는 품사를 지어내지 않는다는 원칙(규칙 1)에 따른 의도적 선택이다. 화면은 값이 있으면 보여주고 없으면 생략한다. 즉 새로 뽑는 단어부터 품사가 붙는다.

### ~~G10. 글자크기 팝오버가 Esc로 닫히지 않는다~~ ✅ **해결 (2026-07-17)** 🟡
**해결**: `web/src/components/FontSizePopover.tsx:25`에 `if (e.key === "Escape") setOpen(false)`. 리스너는 팝오버가 열려 있는 동안만 붙어서 다른 화면의 Esc를 삼키지 않는다(같은 파일 20행 주석). a3 §4-1 요건 충족.

### ~~G11. Supabase가 한 번도 실행된 적 없다~~ ✅ **해결 (2026-08-11)** / Batch API는 미해결 🟡
**Supabase 해결**: 실 DB 쓰기가 성공했다. GitHub Actions run `31493703937` 로그에 `[pipeline] stage=store ok {"editionDate":"2026-08-11","articles":1,"storage":"supabase"}` → `finished — status=success articles=1`.
**⚠️ 2026-08-12 정정 — 이 실행은 그래도 `success`로 끝나지 않았다**: 위 로그를 찍은 것은 13:15:24인데, 그 뒤 프로세스가 종료되지 않아 13:41:44에 `##[error]The operation was canceled.`로 잘렸다. GitHub의 결론은 **cancelled**다(`gh run list`, 44분 44초). 또 `MAX_ARTICLES=2`로 돌린 실행이었다. 함께 인용되던 run `31489819663`은 결론이 success이지만 `llm=mock`이었다(로그 `[pipeline] starting — llm=mock storage=supabase … maxArticles=2`). 정리하면 **"파이프라인이 Supabase에 쓸 수 있다"는 확인됐지만, "anthropic으로 만든 에디션 10건을 Supabase에 끝까지 쓰고 정상 종료한 실행"은 아직 없다.** 잔여 위험 2개: 쓰기 이후 프로세스가 왜 안 끝났는지(핸들 미해제 추정 — 확인 안 함), 그리고 10건 규모에서의 쓰기 성공 여부.
실행 과정에서 발견된 스키마 누락 2건은 마이그레이션 `0003`(`article_status`에 `'held'` 추가)·`0004`(`words.is_key`/`pos`, `categories` 시드)로 메웠다.
**남은 것 1 — Batch API**: 여전히 모든 실행 기록이 `usedBatchApi: false`다. 코드·스케줄 배선은 됐지만 한 번도 실제로 쓰인 적이 없다.
**~~남은 것 2 — 코드 주석이 사실과 다르다~~ ✅ 정정 (2026-08-12)**: `pipeline/src/storage/supabase.ts` 상단의 *"No Supabase project is provisioned yet … never been run against a live database"* 를 실행 근거(run `31493703937`)로 바꿨다. 같은 취지의 낡은 문구를 함께 정리한 곳: `storage/adapter.ts`(supabase 어댑터를 "skeleton with TODOs"라 부르던 문장) · `storage/localFile.ts` · `storage/supabase.test.ts` · `llm/provider.ts` · `llm/mock.ts`(API 키 없음) · `.github/workflows/daily-pipeline.yml`(시크릿 "no values exist yet").

**~~남은 것 3 — 그 정리에서 빠진 파일 2개~~ ✅ 해소 (2026-08-12 7차 실측 확인)**: 3차~6차가 "다음에 `pipeline/`을 커밋할 때 고칠 것"이라며 네 번 연속 넘긴 소스 두 파일은 **이미 고쳐져 있다.** 7차 감사가 파일을 직접 읽어 확인했다 — 이 문서가 "아직 미정정"이라고 적고 있던 쪽이 낡은 기술이었다.

| 파일 | 3~6차가 "아직 이렇게 적혀 있다"고 한 문장 | 7차 실측 |
|---|---|---|
| `pipeline/src/index.ts` 머리 주석의 `STORAGE=supabase` 설명 | *"Implemented (storage/supabase.ts) but never yet run against a live project — verified only with a mocked-client unit test until a real one exists"* | **그 문장은 파일에 없다.** `:17-25`가 *"It has written to a live project once: Actions run 31493703937 (2026-08-11) logged stage=store ok with 1 article. That was a partial run, though — MAX_ARTICLES=2, and the run itself ended cancelled … treat the write path as proven only for the shapes storage/supabase.test.ts covers"* 로 적혀 있다. 이 문서가 "고칠 때 이렇게 적으라"고 요구한 **"라이브 실행 1건 있음, 다만 부분 실행"**이 그대로 반영돼 있고, `storage/supabase.ts:2-8`과의 불일치도 함께 사라졌다 |
| `pipeline/package.json:5` (`description`) | *"BRIEFLY daily content pipeline worker (**scaffold only** — implementation owned by the pipeline team). See … §2 for the 8-stage flow this **will** implement."* | **`scaffold only`·`will implement` 문구는 파일에 없다.** 현재 값은 *"BRIEFLY daily content pipeline worker. Implements stages [1]-[6] of the 8-stage flow in docs/design/a1-architecture.md §2 (collect · cluster · selectTop10 · extract · generate · gate); [7] approval and [8] publish belong to web/admin. Runs against paid providers — see src/index.ts for the env switches."* 이다 |

같은 유형으로 함께 적혀 있던 **`.github/workflows/ci.yml:5`의 "341 tests"도 이미 없다.** 현재 `:7-10` 주석은 *"(No count is quoted here on purpose: an earlier draft of this comment cited 341, a number that matched no measurement this repo ever recorded. The current figure lives in docs/feature-status.md §검증 방법, next to the date it was measured.)"* 로, **이 문서가 권고한 "수치를 박지 말고 §검증 방법을 가리키게 하라"까지 그대로 적용돼 있다.**

**교훈**: "소스는 못 고치니 문서에 기록만 해 둔다"고 적은 항목은 **다음 감사에서 소스를 다시 읽어 확인할 것.** 이 세 건은 실제로는 고쳐진 뒤에도 네 번의 감사 동안 "미정정"으로 남아, 문서가 소스를 부당하게 낡았다고 고발하고 있었다. 기록만 하는 항목에는 항상 재확인 대상 표시를 남긴다.

### G12. 큐레이션 단어가 레벨당 5~6개뿐이라 대부분의 클릭이 "뜻 준비 중"이다 🟡
B1 본문 약 270단어 중 뜻이 있는 단어는 5개다. (**2026-08-12 수치 정정** — 시드 실측은 정확히는 "레벨당 5개"가 아니라 버전 30개 중 27개가 5개, 3개가 6개다. `words.json` 총 153개, min 5 / max 6. 2026-08-11 판의 "5개뿐"은 반올림이었고 최대치도 6개라 결론은 같다.) 실측에서 `congressman`(A2에는 뜻이 있는 단어)을 B1 본문에서 누르면 "뜻 준비 중이에요"가 뜬다. 동작은 설계대로지만, 체감상 사전이 거의 비어 있다. 이것을 메우는 것이 §4.9(기사 전체 사전)이며 현재 보류 상태다 — 즉 **보류의 대가가 사용자에게 가장 크게 드러나는 지점**이므로 해제 우선순위 판단에 참고할 것.

### G13. 기본 UI가 뉴스프린트 스킨으로 바뀌었는데 설계 문서에 없다 🟠 (2026-08-11 신규)
`web/src/components/newsprint/useNewsprintSkin.ts`의 `useNewsprintSkin()`(선언 `:19`, 판정 `const isDark = …` `:23`, 반환 `return !isDark;` `:24`)은 **다크 모드가 아닌 모든 경우 `true`** 를 반환하고(*줄 번호는 **2026-08-12 7차 재실측**. 4차가 고쳐 넣은 `선언 :20 / 판정 :23 / 반환 :25`는 판정만 맞고 나머지가 한 칸씩 밀려 있었다 — `:18`이 docblock 닫는 ` */`, `:19`가 선언, `:24`가 `return !isDark;`, `:25`는 닫는 `}`다. 파일은 그 사이 수정된 적이 없으므로 코드 이동이 아니라 재실측이 틀린 것이다*), `SkinnedHomeView`/`SkinnedArticleViewer`/`SkinnedArchiveView`/`SkinnedMyView`/`SkinnedSettingsView`가 그때 뉴스프린트 컴포넌트를 렌더한다(커밋 `c95660e`). 즉 **1902년 신문 스킨이 기본이고, a3-ui-ux.md가 규정한 표준 스킨("☕ BRIEFLY" 헤더·인사말 블록·카테고리 요약 칩)은 다크 모드 폴백으로 밀렸다.**
문제는 이 전환이 어느 설계 문서에도 반영되지 않았다는 것이다. a3-ui-ux.md §2-1은 여전히 표준 스킨 와이어프레임만 담고 있고, 뉴스프린트 스킨의 설계 근거·경계 조건("라이트 전용", 다크 폴백)은 핸드오프 문서에만 있다. 이 문서의 1-B/1-D "실화면" 판정도 표준 스킨 시절의 확인 기록이다. 데스킹 도구(리드 기사 지정·일괄 승인)와 기사 컷 이미지도 마찬가지로 설계 문서에 없다.
**해야 할 일**: (a) a3-ui-ux.md에 뉴스프린트 스킨 절 추가 — 지금은 §2-1 머리에 경고만 붙여 뒀다. (b) 뉴스프린트 스킨 기준으로 1-B/1-D 실화면 전수 재확인.

### G14. 동작하는 기능의 상당 부분이 아직 커밋되지 않았다 🟠 (2026-08-12 신규 · 같은 날 목록 정정)
이 문서가 "구현됐다"고 판정한 것 중 **Layer 2 GDELT 신호 · Layer 3 편집회의 · 반려 재생성 배치 · 단계 체크포인트 재개 · CI 워크플로**는 전부 `.git/index`에 없는 **untracked 파일**에 들어 있다. 여기에 추적 중인 파일의 미커밋 수정이 더 얹혀 있다.

이 항목을 처음 적을 때 untracked 파일을 9개로 적었는데, **`git ls-files --others --exclude-standard` 실측은 26개**다(2026-08-12 6차). 세지 않은 17개 중에 배포를 막는 것이 있으므로 전수를 적어 둔다. *(4차 판은 25로 적었는데, 그 뒤 5차가 `supabase/migrations/0005_pipeline_checkpoints.sql`을 추가하며 아래 표만 3건으로 늘리고 이 문장은 그대로 뒀다 — 표의 묶음 합(3+7+1+4+9+2)은 26인데 머리 문장만 25를 말하고 있었다. 6차에서 26으로 맞췄다.)*

| 묶음 | 파일 | 왜 중요한가 |
|---|---|---|
| DB 마이그레이션 (3) | `supabase/migrations/0003_article_status_held.sql` · `0004_words_pos_and_categories_seed.sql` · `0005_pipeline_checkpoints.sql` | 🔴 **가장 급하다.** `docs/DEPLOYMENT.md` 1단계 표와 `README.md`(supabase 절)가 "5개를 번호 순서대로 실행"하라며 **필수**로 지정하고, 빼먹으면 파이프라인이 쓰기 단계에서 실패한다(0003·0004)거나 재개가 안 된다(0005)고 경고한다. 그런데 그 3·4·5번이 리포에 없다 — `git ls-files supabase/migrations` 는 0001·0002 두 건만 돌려준다. **문서의 1단계를 그대로 따라갈 수 있는 사람이 아직 없다** |
| 파이프라인 (7) | `pipeline/src/pipeline/globalImpact.ts` · `layer2Layer3.test.ts` · `regenerate.ts` · `regenerate.test.ts` · `resume.test.ts` · `src/scripts/run-regenerate.ts` · `src/storage/checkpointFile.ts` | GDELT 신호 · Layer 3 편집회의 · 반려 재생성 · 체크포인트 재개의 구현체 |
| CI (1) | `.github/workflows/ci.yml` | 이것이 없으면 테스트 494개는 아무 자동 검증도 받지 못한다 |
| web 라우트 (4) | `web/src/app/error.tsx` · `global-error.tsx` · `loading.tsx` · `not-found.tsx` | Next.js 파일 컨벤션(에러 경계 · 로딩 폴백 · 404). 리포에는 이 화면들이 없다 |
| web 테스트 (9) | `web/src/app/admin/actions.test.ts` · `components/Segmented.test.tsx` · `components/newsprint/NewsprintArticleBody · ArticleViewer · FrontPage · MyView.test.tsx` · `lib/admin/publishEdition.test.ts` · `lib/admin/regenerateRequest.test.ts` · `lib/sessionStorage.test.ts` | 위 "web 269개"의 상당 부분 |
| 문서 (2) | `docs/newsprint-cuts/PROMPTS.md` · `README.md` | 기사 컷 생성 프롬프트 |

왜 문제인가: (a) 이 기능들은 GitHub에 없으므로 **GitHub Actions로 파이프라인을 돌리면 여전히 옛 코드가 돈다** — 즉 "다음 실행에서 Layer 3를 확인하자"(G7)는 커밋 없이는 성립하지 않는다. (b) 로컬 디스크가 유일한 사본이다. (c) `ci.yml` 자신이 커밋되지 않아 테스트 494개는 여전히 아무 자동 검증도 받지 못한다. (d) **`git rev-list --count origin/main..HEAD` = 0** — origin/main은 `316ca2d` 그대로이므로, 지금 리포를 clone 한 사람의 `supabase/migrations/`에는 `0001`·`0002` 두 개뿐이다. 배포 문서를 그대로 따라가면 3·4·5번 파일을 찾지 못하고, 3·4 없이 파이프라인을 돌리면 문서가 예고한 그 실패(존재하지 않는 enum 값 `'held'`, 없는 컬럼 `words.pos`/`is_key`)를 그대로 만나며, 5 없이 돌리면 재개가 조용히 죽는다.
**해야 할 일**: 커밋·push — 마이그레이션 3개(0003·0004·0005)가 최우선이다. 그 뒤에 이 문서 머리의 검증 기준을 새 커밋 해시로 갱신한다.

### G15. 이 문서의 검증 기준이 코드보다 한 세대 뒤처졌다 🟠 (2026-08-12 신규, 이번 갱신으로 정정)
2026-08-11 판은 검증 기준을 `feat/newsprint-skin-and-pipeline-cost` 브랜치의 `8f599fd`로 적어 뒀는데, 실제 작업은 그날 `main`으로 옮겨져 `316ca2d`까지 갔고 그 위에 미커밋 변경이 쌓였다. 그 결과 **하루 만에** 문서가 구현을 잘못 서술하기 시작했다 — Layer 3 "❌ 미구현", Layer 2 "6신호 중 4개", 반려 "❌ 미구현", 테스트 "446개", `selectTop10.ts:210`(다른 코드를 가리킴). 전부 8f599fd 시점에는 맞았고 지금은 틀린 문장이다.
이것은 2026-08-11 갱신 메모가 지적한 것과 **같은 실패의 재발**이다(그때는 한 달, 이번엔 하루). 원인은 게으름이 아니라 문서 구조다: 검증 기준이 문서 안의 한 줄 텍스트라, 코드가 움직여도 아무도 그 줄을 건드리지 않는다.
**해야 할 일**: (a) 기능을 커밋할 때 이 문서의 "검증 기준" 줄을 같은 커밋에서 갱신한다. (b) 근거를 적을 때 `파일:줄` 대신 `파일 심볼명(줄)` 형식을 쓴다(G5 교훈). (c) 상태 판정은 커밋 해시와 함께 적는다 — "언제 기준의 사실인가"가 없으면 다음 사람이 검증할 수 없다.

---

# 3. 의도적 보류 목록

| 기능 | 근거 | 해제 조건 |
|---|---|---|
| 퀴즈(UI·파이프라인 생성·시드 전부) | design-decisions §4.5 — 2026-07-10 사용자 지시로 MVP 제외. DB의 quizzes/quiz_options 테이블은 남겨둠 | V1.5 |
| 기사 전체 사전 채우기 | design-decisions §4.9 — 2026-07-13 사용자 지시. "목업에 수작업으로 단어를 채우지 않는다(토큰 절약)" | 파이프라인 사전 생성 단계 구현 시 |
| 학습 기능 확장 전반(AI Conversation·쉐도잉/TTS·복습 시스템·Progress) | enhancement-plan "범위 제외" — 사용자 별도 구상 대기 | 사용자 구상 확정 후 |
| 사전 발음 재생 버튼(🔊) | design-decisions §4-4 — IPA 표기만, 재생은 V1.5 | TTS 도입 시 |
| 레벨 스위처 Original 칸 | design-decisions §4-7 — 원문은 하단 출처 링크로 갈음(저작권 전략 정합) | 재검토 시 |
| 온보딩 관심사 선택 | design-decisions §4-6 — 관심사 큐레이션은 V2 | V2 |
| Top10 개인화(코어+포유) | top10-curation §3 — Top10 개인화 시 "오늘 이 10개" 신뢰 자산이 사라짐 | V2 |
| Sentence Compare(문장 3레벨 비교) | production §7 | V1.5 |
| 유료화·결제 | enhancement "범위 제외" — MVP 검증 후 | MVP 검증 후 |

> 보류는 "안 만든 것"이 아니라 "안 만들기로 정한 것"이다. 위 항목을 갭으로 다시 올리지 않는다. 해제할 때는 근거 문서와 이 표를 함께 갱신한다.

---

# 4. 이 문서를 쓰는 법

1. 기능을 새로 만들면 해당 영역 표에 **한 줄 추가** — 기능명 / 계획 출처(문서§) / 상태 / 확인 방법 / 비고.
2. 상태를 ✅로 올릴 때는 "코드가 있다"가 아니라 **실제로 동작을 봤다**를 기준으로 한다. 사용자 대면 기능이면 실화면, 파이프라인이면 산출물.
3. △로 둘 때는 **무엇이 부족한지**를 비고에 반드시 적는다. "부분 구현"만 적힌 줄은 다음 사람에게 아무 정보도 주지 않는다.
4. 갭을 고치면 §2에서 지우지 말고 **해결 표시와 날짜를 남긴다** — 왜 그런 결정을 했는지가 다음 판단의 근거가 된다.
5. 보류를 해제하면 §3에서 §1로 옮긴다.

---

## 변경 이력

- **2026-07-17**: 갭 분석에서 발견된 결함 5건 수정 완료 (신뢰 고지 매체 수 dedup, 홈-뷰어 날짜 통일, World 지역 분산 배선, word_count 게이트 신설, 사전 pos 슬롯·Esc). 해당 항목들의 상태 갱신 필요 시 이 커밋 기준: "fix: 갭 분석 결함 5건". 남은 주요 ❌: 운영자 검수 콘솔, 실인증, 배포 인프라, 알림 (production-readiness.md 참조).
- **2026-08-11**: 문서-구현 격차 21건 일괄 정정. 2026-07-17에 고친 결함 5건(G2·G4·G5·G6·G9·G10)이 §1 표와 §2에 반영되지 않은 채 한 달 가까이 "미구현"으로 남아 있었고, 그 사이 검수 콘솔(G1)·Supabase 실연결(G11)·기사별 OG 메타·GitHub 리포·뉴스프린트 스킨이 새로 구현됐다. 이번 갱신 내용:
  - §2에 §4-4 규칙대로 **해결 표시와 날짜**를 소급 적용 (G1·G2·G4·G5·G6·G9·G10·G11).
  - 테스트 수 219 → **446** 정정 (web 261 + pipeline 185, 실측). web 실행 방법 주의 추가. *(→ 2026-08-12 재실측 486으로 다시 갱신)*
  - GitHub Actions 항목을 "수동 실행"(✅, 이력 5건)과 "일일 스케줄 cron"(❌, **주석 처리로 꺼져 있음**)으로 분리. "시크릿이 없어 실행 이력 없음"은 사실이 아니었다.
  - Supabase 어댑터 △ → ✅ (Actions run `31493703937`에서 실 DB에 기사 1건 기록). *(→ 2026-08-12 다시 △로. 그 실행의 결론이 success가 아니라 cancelled였고 `MAX_ARTICLES=2`였다.)*
  - 뉴스프린트 스킨·기사 컷을 §1-B에 신규 등재하고, 설계 문서 미반영을 **G13**으로 신규 등록.
  - 판정 집계 92행/52·16·17·7 → **99행/64·12·16·7**로 재집계.
  - 미정정 1건: `pipeline/src/storage/supabase.ts` 상단 주석이 아직 "never been run against a live database"라고 적혀 있다. 이번 작업은 문서만 수정하는 범위라 손대지 않았다 — G11 참조. **→ 2026-08-12 정정 완료.**
- **2026-08-12**: 문서-구현 격차 11건 정정. 이번에는 **문서가 코드보다 뒤처진 쪽**이었다 — 구현은 옳고 문서가 틀렸다(G15). 검증 기준을 `main`/`316ca2d` + 미커밋 작업 트리로 갱신하고, 아래를 실측으로 고쳤다:
  - **Layer 3 LLM 편집회의 ❌ → △** — 구현돼 있고 선정 **전에** 호출된다(`selectTop10.ts`의 `runEditorialMeeting()`, 선언 `:631` — *2026-08-12 3차에 `:632`에서 재실측 정정*, 응답 순위를 `llmProposedRank`로 기록해 쿼터가 그 순서대로 채움). G7을 "코드 해결"로 표시.
  - **Layer 2 6신호 + 감점 전부 배선 확인** — GDELT 신호 구현체 `pipeline/globalImpact.ts`가 `index.ts`에서 주입된다. 두 항목 모두 실행 산출물 확인이 없어 ✅가 아니라 △로 뒀다.
  - **반려(재생성 요청) ❌ → ✅** (production-readiness.md §2) — 콘솔 버튼(`ReviewClient.tsx:610`)→서버 액션(`actions.ts:56`)→`npm run regenerate` 배치까지 경로가 이어져 있다. 검수 콘솔 서버 액션 수도 7 → **8**로 정정.
  - **테스트 446 → 485** (web 269/27파일 + pipeline 216/26파일, 2026-08-12 실행 실측). *(→ 같은 날 4차에서 **486**으로 재정정. pipeline은 216이 아니라 217이었다 — 아래 4차 항목 참조.)*
  - **Actions 실행 기록 정정** — run `31493703937`의 결론은 success가 아니라 **cancelled**이고 `MAX_ARTICLES=2`였다. 나머지 성공 1건은 `llm=mock`. 그래서 Supabase 어댑터를 ✅ → △로 내렸다. 5건 결론 내역(success 1/failure 3/cancelled 1)도 명시.
  - **인벤토리 3행 신규 등재** — CI 워크플로(`ci.yml`), 단계 체크포인트·재개(`RESUME`), 반려 재생성 배치. 셋 다 코드·테스트만 있고 실행 확인이 없어 △.
  - **`selectTop10.ts` 줄 번호 재실측** (210 → 272, 346~366 → 412). 코드가 커지며 문서의 근거가 다른 코드를 가리키고 있었다.
  - **G14 신규** — 위 기능 대부분이 아직 **커밋되지 않은 파일**에 있다. GitHub에는 없으므로 Actions 실행으로는 확인할 수 없다.
  - **G14 목록 정정 (같은 날)** — untracked 파일을 9개로 적었는데 `git ls-files --others --exclude-standard` 실측은 **25개**였다. 빠져 있던 것 중 `supabase/migrations/0003`·`0004`가 결정적이다 — `DEPLOYMENT.md`·`README.md`가 필수로 지정한 마이그레이션인데 리포에 없다. 문서가 "이건 안 올라갔다"고 적을 때조차 **목록을 눈으로 세지 말고 `git ls-files`로 셀 것.**
  - 판정 집계 99행/64·12·16·7 → **102행/62·18·15·7**.
- **2026-08-12 (2차)**: 같은 날 후속 감사에서 "구현이 옳고 문서가 틀린" 갭 11건을 추가로 정정했다. 이번 것들은 기능 누락이 아니라 **문서가 근거로 댄 파일·줄·수치가 실제와 다른** 유형이다:
  - **인사말 블록 ✅ → △** (§1-B) — "Good Evening"은 `GreetingBlock.tsx:17` 표준 스킨 전용이고, 기본 화면인 뉴스프린트 홈 헤더에는 인사말·총 읽기시간·현재 레벨이 없다(날짜만 `FolioLine`으로 남음). §1-B 머리 경고와 G13이 "재확인 안 함"이라고 밝혀 뒀는데도 행 자체는 ✅ 실화면으로 남아 있었다. 집계 63·17 → **62·18**.
  - **카테고리 요약 칩의 "탭 필터는 후속 예정" 삭제** (§1-B) — 뉴스프린트 섹션 스트립은 이미 `setSection()` + 목록 스크롤로 동작하는 필터다. 구현이 문서를 앞질렀다.
  - **체크포인트 재개 로그의 파일 귀속 정정** (§1-A) — 한국어 문구 `(체크포인트에서 재개 — 재실행 안 함)`은 `run.ts`가 아니라 `index.ts`에 있다. `run.ts`가 찍는 것은 영문 `stage=… skipped — resumed from checkpoint`.
  - **Words in this story 수치 정정** (§1-B, G12) — `words.json` 실측은 "레벨당 5개"가 아니라 27개 버전 5개 / 3개 버전 6개(총 153개, min 5 / max 6).
  - **production-readiness.md 줄 번호 재실측 2건** — 게이트 표시 `ReviewClient.tsx:17-21`(서버 액션 import였다) → `:284`·`:432` + `gateStatus.ts`, provenance `:442-445`(기사 제목 렌더링이었다) → `:475`·`:478`·`:481`·`:513`. **G5가 남긴 교훈이 같은 저장소 안에서 재발했다** — 이번에는 심볼 이름을 함께 적었다.
  - **날짜 표기 정정** — production-readiness.md §1 표의 열 제목(2026-08-11 → 2026-08-12, 셀 내용이 이미 08-12 실측이었다), docs/README.md의 feature-status/production-readiness 갱신일과 인벤토리 행 수(99개 → 102행).
  - **a2-data-model.md `words` 컬럼 수 정정** — 스키마 차이를 경고하려던 표 자체가 양쪽 다 하나씩 적었다. 이 문서 §4 DDL은 6개가 아니라 **7개**, 실제 스키마는 8개가 아니라 **9개**(0001의 7개 + 0004의 `is_key`·`pos`).
  - **a1-architecture.md 부록 테이블 목록에 경고 추가** — `users`·`events`·`fact_provenance` 세 테이블은 실제 스키마에 없다(각각 `profiles` / DB 아님(`cluster.ts` 메모리) / `facts`+`fact_sources`). docs/README.md가 a2·a3에만 붙였던 "실제와 다르다" 경고를 a1에도 붙였다.
- **2026-08-12 (3차)**: 같은 날 세 번째 감사에서 "구현이 옳고 문서가 틀린" 갭 6건을 정정했다. 이번 6건 중 **3건은 소스 파일의 머리 주석·메타데이터**여서(문서만 고치는 범위) 고치지 못하고 **정확한 내용과 함께 이 문서에 기록만 해 뒀다** — 다음에 해당 패키지를 커밋할 때 함께 고칠 것.
  - **a1-architecture.md 재개 설계 정정 (문서 수정)** — a1 §2가 "각 단계는 **DB에** 상태를 남긴다 / 어느 단계에서 죽어도 재개한다"고, §2 실패표가 "**status 컬럼**으로 재개", §6이 "단계별 **DB 커밋**으로 재개 가능하게"라고 적고 있었다. 실제 구현은 `pipeline/src/storage/checkpointFile.ts`가 `pipeline/output/checkpoints/<날짜>.json`을 쓰는 **로컬 파일**이고, Supabase 어댑터도 같은 파일 함수를 임포트한다 — 체크포인트 테이블도 단계용 `status` 컬럼도 마이그레이션에 없다. 그래서 §6이 고른 실행 환경(GitHub Actions)에서는 **같은 job 안의 재시도만 재개되고 다시 dispatch 된 job 은 처음부터 돈다**(구현 파일이 스스로 밝힌 한계). a1 §0·§1.3·§2·§2 실패표·§6 다섯 곳에 실측 경고를 붙이고, §1-A 재개 행의 △ 사유에도 이 이탈을 추가했다("재개해 본 기록이 없다"만 적혀 있었다).
  - **§1-E "이미지 없음" 정정 (문서 수정)** — 1-E 행이 "이미지 없음"이라고 적는 동안 §1-B "기사 컷" 행은 컷이 렌더된다고 적어, **한 문서가 서로 다른 말을 하고 있었다.** 실제로는 lead 기사 1건에 컷 PNG가 있고 `newsprint/chrome.tsx`가 `<img>`로 그린다. 다만 **판정은 ✅로 유지**했다 — 렌더되는 이미지는 보도사진이 아니라 AI 일러스트이고, news-sourcing §3이 요구한 고지 `ILLUSTRATION_NOTICE`("일러스트이며 실제 보도사진이 아닙니다.")가 `chrome.tsx:129` 선언 → `:240` 렌더로 캡션에 함께 나오기 때문이다. **첫 초안에서 "고지가 화면에 없다"고 쓸 뻔했다가 코드를 열어 보고 정정했다** — 없다고 단정하기 전에 grep 한 번. 고지 렌더는 코드 확인이므로 실화면 재확인은 G13 과제로 남겼다.
  - **`selectTop10.ts` 줄 번호 한 칸 정정 (문서 수정)** — `runEditorialMeeting()` 선언은 `:632`가 아니라 **`:631`**이다(632는 첫 인자 줄). §1-A Layer 3 행 · G7 · 변경 이력 2026-08-12 항목 세 곳을 `파일 심볼명(줄)` 형식으로 고쳤다. **G5·G15가 세 번 경고한 바로 그 실패 유형이 또 나왔다** — 다만 이번엔 심볼명을 함께 적어 둔 덕분에 한 칸 어긋나도 대조가 가능했다. 그것이 그 규칙의 값이다.
  - **`pipeline/src/index.ts:16-20` 낡은 주석 (기록만)** — `STORAGE=supabase`를 "never yet run against a live project"라고 설명한다. 같은 저장소의 `storage/supabase.ts:2-8`은 이미 run `31493703937`을 근거로 정정돼 있어 **두 파일이 서로 다른 말을 한다.** 2026-08-12 낡은 주석 정리(G11 "남은 것 2")가 7개 파일을 고치면서 **파이프라인 진입점을 빠뜨렸다.** *(→ **7차: 해소.** 지금 `index.ts:17-25`는 run `31493703937`을 근거로 "라이브 실행 1건, 다만 부분 실행"이라 적고 있다. G11 "남은 것 3" 표 참조.)*
  - **`pipeline/package.json:5` `description` (기록만)** — 아직 *"scaffold only … the 8-stage flow this **will** implement"*라고 적혀 있다. 실제로는 collect·cluster·selectTop10·extract·generate·gate·run이 모두 구현돼 있고 테스트 217개가 통과하며 유료 실행 기록도 있다($1.0366). 같은 정리에서 함께 빠졌다. *(→ **7차: 해소.** `description`은 이미 "Implements stages [1]-[6] … [7] approval and [8] publish belong to web/admin"으로 바뀌어 있다.)*
  - **`.github/workflows/ci.yml:5` "341 tests" (기록만)** — CI 도입 이유를 적으며 인용한 341이 **어느 시점의 실측치와도 맞지 않는다**(기록된 값은 219 / 446 / 486뿐, 현재 486). 파일이 아직 커밋되지 않아 아무도 대조하지 않았다. 커밋할 때 486으로 고칠 것. *(→ **6차 갱신: 486이 아니라 494다.** 최신 지시는 §1-A CI 워크플로 행을 볼 것 — 애초에 수치를 소스 주석에 박지 말고 §검증 방법을 가리키게 하는 편이 낫다.)* *(→ **7차: 해소.** 341은 파일에서 사라졌고, 주석은 수치 대신 §검증 방법을 가리키도록 바뀌어 있다.)*
  - 판정 집계 변동 없음 — **102행/62·18·15·7** 유지(1-E 행은 ✅ 유지, 재개 행은 이미 △였다).
  - **이번 감사의 교훈**: 낡은 주석을 일괄 정리할 때 **파일 목록을 손으로 세지 말 것.** 2026-08-12 1차는 7개를 고치고 3개를 놓쳤고, 그 3개가 전부 "새로 온 사람이 가장 먼저 읽는 파일"(진입점 주석 · 패키지 설명 · CI 헤더)이었다. G14가 남긴 교훈("`git ls-files`로 셀 것")과 같은 실패다 — 대상은 `grep`으로 뽑을 것.
- **2026-08-12 (4차)**: 같은 날 네 번째 감사. 이번 갭 7건도 전부 **구현이 옳고 문서가 틀린** 유형이었고, 그중 5건은 문서에서 고쳤다. 나머지 2건은 소스 파일(주석·메타데이터)이라 이번에도 기록만 갱신했다.
  - **테스트 수 485 → 486 (pipeline 216 → 217)** — `cd pipeline && npm test` 재실행 결과 "Test Files 26 passed (26) / Tests 217 passed (217)". 파일 수는 맞았고 테스트 수만 1개 어긋나 있었다(같은 날 1차 측정 이후 작업 트리의 `pipeline/src/gates/cefr.test.ts`가 수정됐는데 재측정하지 않았다). web은 27파일/269개로 문서와 일치. 같은 216/485가 **이 문서(§검증 방법 · §1-F 테스트 안전망 · §1-A CI 워크플로 · G14) · `README.md:79` · `docs/production-readiness.md` 두 곳**에 퍼져 있어 전부 함께 고쳤다.
  - **`score.ts` WEIGHTS 줄 범위 정정** (§1-A Layer 2 행 · G7) — `51-63`이라고 적었으나 실제는 선언 `const WEIGHTS = {`가 `:52`, 닫는 `} as const;`가 `:66`이고 인용한 `demerit: -2.0`은 `:65`로 **적어 둔 상한을 넘어 있었다**. 가중치 값 3개(globalImpact 2.0 / learnability 2.0 / demerit -2.0)와 같은 표의 다른 근거(`score.ts` `ScoreInputs`(34-41) · 합산(100-118) · `index.ts:56,118-119,136` 주입 · `selectTop10.ts:602`)는 전부 정확했다. *(→ **6차 정정: 이 문장은 틀렸다.** `ScoreInputs`는 존재하지 않는 이름이었다 — 실제는 `ScoreBreakdown`(`:31-43`)과 `ExternalSignals`(`:46-50`)다. 줄 번호는 대조했지만 심볼명은 대조하지 않았다.)* *(→ **7차 정정: "전부 정확했다"는 문장이 한 번 더 틀렸다.** `index.ts:56,118-119,136` 네 줄 번호가 모두 어긋나 있었다 — 실제는 import `:61` · `const gdeltOn` `:122` · 생성 `:123-125` · 주입 `:141`. 4차는 이 근거를 재실측하지 않고 "정확했다"고 적었다.)* G5·G15가 세 번 경고한 "줄 번호만 남기면 코드가 조금만 움직여도 문서가 거짓이 된다"의 **네 번째 재발** — 이번에도 심볼명을 함께 적는 형식으로 고쳤다.
  - **`useNewsprintSkin.ts` 줄 범위 정정** (§1-B 뉴스프린트 스킨 행 · G13 · `docs/design/a3-ui-ux.md` 머리 경고) — 세 문서가 똑같이 `:19-24`를 인용했는데 19는 docblock 닫는 ` */`이고, 결론인 `return !isDark;`는 `:25`라 **인용 범위 밖**이었다. 동작 서술("다크 모드가 아닌 모든 경우 true")은 정확하다. 선언 `:20` · 판정 `:23` · 반환 `:25`를 심볼명과 함께 적는 형식으로 세 곳을 고쳤다. **잘못된 범위가 문서 3개에 복사돼 있었다** — 한 곳에서 틀리면 복사본 수만큼 틀린다. *(→ **7차 정정: 이 수정값 자체가 틀렸다.** 실제는 선언 `:19` · 판정 `:23` · 반환 `:24`이고 `:25`는 닫는 `}`다. 세 곳을 동시에 고치면서 틀린 값을 세 곳에 함께 복사해, 4차 이후에도 세 문서가 나란히 틀린 채로 남아 있었다 — 복사본을 한꺼번에 고치는 것은 틀린 값도 한꺼번에 퍼뜨린다.)*
  - **`docs/project-brief.md` §14 "기사 사진·삽화는 사용하지 않는다" 정정** — 문장 그대로면 지금 배포되는 화면을 금지한다. 기본 스킨은 lead 기사 1건에 컷 이미지를 렌더하고(`newsprint/chrome.tsx`의 `Cut`, 호출부 3곳 모두 `isLead` 가드), 실제 파일도 1장 있다(`article-2026-07-13-4.png`). 같은 저장소의 `docs/news-sourcing-strategy.md:60`은 "보도사진 사용 금지 / 스톡·AI 일러스트 + 고지"로 삽화를 **허용**하고 구현은 그 고지까지 지킨다(`ILLUSTRATION_NOTICE`). §14가 저작권 절이므로 원래 뜻은 "원문 기사의 사진·삽화"였을 것이나 그 한 단어가 빠져 있었다 — 문장을 "**원문 기사의** 사진·삽화"로 좁히고, 직접 제작한 일러스트는 news-sourcing §3 조건 아래 허용된다는 단서를 붙였다. 3차에서 §1-E를 고칠 때 project-brief까지 되돌리지 않아 남아 있던 모순이다.
  - **`pipeline/src/index.ts:16-20` · `pipeline/package.json:5` (이번에도 기록만)** — 소스 파일이라 이번 범위에서도 고치지 못했다. 정확한 표현은 §2 G11 "남은 것 3" 표에 그대로 두고, package.json 항목의 테스트 수만 217로 갱신했다. **세 번 연속 "다음에 고칠 것"으로 넘어간 항목이다** — 문서 감사로는 더 이상 줄일 수 없고, `pipeline/`을 커밋할 때 소스에서 고쳐야 한다. *(→ **7차: 두 파일 모두 이미 고쳐져 있었다.** 4~6차는 "소스라서 못 고친다"고만 적고 **소스를 다시 읽지 않았다** — 그래서 고쳐진 뒤에도 세 번 더 "미정정"으로 실렸다. 기록만 남기는 항목이라도 매 감사마다 원본을 다시 읽을 것.)*
  - 판정 집계 변동 없음 — **102행/62·18·15·7** 유지(수치·줄 번호 정정뿐, 상태가 바뀐 행 없음).

- **2026-08-12 (5차 · 코드 수정)**: 앞의 감사들과 달리 이번엔 **문서가 옳고 구현이 뒤처진** 갭을 코드로 메웠다. 문서 문구를 구현에 맞춰 낮추는 대신, 구현을 문서가 약속한 자리로 올린 첫 회차다.
  - **단계 체크포인트를 러너 밖으로** (§1-A 재개 행 (b) · a1 §1·§1.3·§2·§5·§6 · `docs/README.md`) — a1 §2가 약속한 "어느 단계에서 죽어도 마지막 성공 지점부터 재개한다"가 정작 §6이 고른 실행 환경(GitHub Actions)에서만 성립하지 않았다. 체크포인트가 러너 로컬 JSON 파일이라 job 이 죽고 다시 dispatch 되면 사라졌고, 재개가 지켜 주려던 것이 바로 이미 돈을 치른 Opus 재작성분(1회 약 $1.04)이다. `supabase/migrations/0005_pipeline_checkpoints.sql`(신규)과 `storage/supabase.ts`의 체크포인트 3개 메서드를 테이블 기반으로 바꿨다. 만료 행(재개 유효기간 초과)은 실행 시작 때 어댑터가 지운다 — payload 하나가 하루치 수집 본문이라 무료 티어 용량을 갉아먹기 때문이다. 유효기간 상수는 `storage/adapter.ts`의 `CHECKPOINT_MAX_AGE_HOURS` 한 곳으로 모아 `run.ts`와 어댑터가 같은 값을 쓰게 했다. `checkpointFile.ts`는 LocalFile 어댑터 전용으로 남았다(그 실행은 파일을 가진 기계에서 돈다). 테스트 `pipeline` 217 → **225**(신규 8건, `supabase.test.ts`).
  - **재개 행은 여전히 △다.** 이탈 사유 (b)는 해소됐지만 (a) "실제로 중단된 실행을 재개해 본 기록이 없다"는 그대로다 — 확인 근거가 단위 테스트뿐인 것은 코드로 바꿀 수 없다.
  - **마이그레이션 4개 → 5개** (`DEPLOYMENT.md` 1단계 표·확인 쿼리 · `README.md` supabase 절 · G14) — 0005를 빼먹으면 파이프라인이 멈추지는 않고 재개만 조용히 안 되므로, 0003·0004와 달리 **로그를 안 보면 모르고 지나간다**는 경고를 따로 붙였다.
  - ⚠️ **G14(미커밋)는 이번 회차로 더 나빠졌다.** 0003·0004에 더해 0005까지 untracked 상태다 — `git ls-files supabase/migrations`는 여전히 0001·0002 두 건만 돌려준다. 이 회차의 작업자는 커밋 권한이 없어 파일만 놓았다. **문서가 필수라고 지정한 마이그레이션 3개가 리포에 없는 상태는 사람이 커밋해야만 풀린다.**

- **2026-08-12 (6차)**: 5차의 코드 수정이 남긴 **문서 뒤처짐 8건**을 정리했다. 8건 모두 구현이 옳고 문서가 틀린 유형이었고, 이번엔 전부 문서에서 고칠 수 있었다(소스 파일은 손대지 않았다). 공통 원인 하나가 뚜렷하다 — **5차가 "여러 곳에 흩어져 있으니 커밋 직전에 한 번에 고치자"며 미룬 수치들이 그대로 모순으로 굳었다.**
  - **테스트 486 → 494** (§검증 방법 · §1-A CI 워크플로 행 · §1-F 테스트 안전망 행 · G11 `package.json` 행 · G14 · `README.md` pipeline 절 · `docs/production-readiness.md` 두 곳) — 6차에서 직접 재실행: `cd pipeline && npm test` → "Test Files 26 passed (26) / **Tests 225 passed (225)**", `cd web && npm test` → "Test Files 27 passed (27) / Tests 269 passed (269)". 5차가 늘린 pipeline 8건(`storage/supabase.test.ts` 체크포인트)이 반영되지 않아, **같은 문서가 본문에서는 486을, 각주에서는 494를 말하고 있었다.**
  - **untracked 25 → 26** (§검증 기준 주의 · G14 머리) — G14 표의 묶음 합(마이그레이션 3 + 파이프라인 7 + CI 1 + web 라우트 4 + web 테스트 9 + 문서 2)은 이미 26인데 머리 문장만 4차의 25를 유지하고 있었다. 5차가 표에 `0005_pipeline_checkpoints.sql`을 더하면서 문장을 함께 고치지 않은 결과다. **한 항목 안에서도 표와 문장이 서로 다른 수를 말할 수 있다.**
  - **마이그레이션 4개 → 5개** (`README.md` 머리 경고·폴더 구조 · `docs/DEPLOYMENT.md:156` 문제 해결 절 · `docs/design/a2-data-model.md:11`) — 5차가 `DEPLOYMENT.md` 1단계 표와 `README.md` supabase 절만 5개로 고치고 나머지 사본을 남겨, `README.md` 한 파일 안에서 폴더 구조는 4개·supabase 절은 5개를 말하고 `DEPLOYMENT.md` 안에서도 1단계 표(5개)와 문제 해결(4개)이 어긋나 있었다. 디스크 실측은 `supabase/migrations/`에 0001~**0005** 다섯 개다.
  - **`score.ts` 심볼명 정정: `ScoreInputs` → `ScoreBreakdown` + `ExternalSignals`** (§1-A Layer 2 행 · G7) — `ScoreInputs`라는 타입은 `pipeline/src/` 어디에도 없다(`grep -rn ScoreInputs src/` 무결과). `globalImpact`·`learnability`·`demerit`은 점수 결과 타입 `ScoreBreakdown`(`:31-43`)과 외부 신호 입력 타입 `ExternalSignals`(`:46-50`)로 **나뉘어** 있다. 4차가 줄 번호를 재실측하면서 인용한 이름은 대조하지 않아, 4차 항목이 "다른 근거는 전부 정확했다"고 적은 그 목록 안에 틀린 이름이 들어 있었다. G5·G15가 네 번 경고한 "심볼명을 함께 적어라"가 **정작 그 규칙을 적용한 자리에서 이름 쪽으로 깨진** 사례다 — 줄 번호만큼 심볼명도 대조해야 한다.
  - 판정(✅/△/❌)이 바뀐 행은 **없다** — 이번 정정은 수치와 심볼명뿐이라 §1 집계는 4차 그대로다(집계 자체를 다시 세지는 않았다).
  - ⚠️ **G14는 그대로다.** 6차 작업자도 커밋 권한이 없어 문서만 고쳤다. 마이그레이션 3개(0003·0004·0005)를 포함한 26개 파일은 여전히 리포에 없다.

- **2026-08-12 (7차)**: 갭 8건, 전부 **구현이 옳고 문서가 틀린** 유형이라 문서만 고쳤다(소스는 손대지 않았다). 이번 8건은 성격이 둘로 갈린다 — **(A) 이미 고쳐진 소스를 아직 "미정정"이라 고발하던 것 3건, (B) 앞선 감사가 "재실측했다"며 써넣은 줄 번호가 실제와 다른 것 5건.**
  - **(A) "기록만" 3건 해소** (G11 "남은 것 3" 표 · §1-A CI 워크플로 행 · 3차·4차 변경 이력) — `pipeline/src/index.ts` 머리 주석, `pipeline/package.json:5` `description`, `.github/workflows/ci.yml`의 "341 tests"는 **세 파일 모두 이미 고쳐져 있었다.** 특히 앞의 둘은 이 문서가 요구한 표현("라이브 실행 1건 있음, 다만 부분 실행")과 권고안("수치 대신 §검증 방법을 가리켜라")까지 그대로 반영돼 있었다. 3~6차가 네 번 연속 "소스라서 못 고친다, 다음 커밋 때 고칠 것"이라 적으면서 **소스를 다시 읽지 않은 것**이 원인이다. → **규칙: "기록만" 항목은 다음 감사에서 원본을 다시 읽고 시작한다.**
  - **(B) `index.ts` 줄 번호 4개 정정** (§1-A Layer 2 행 · G7 · 4차 변경 이력) — `index.ts:56,118-119,136`은 네 개 모두 어긋나 있었다. 실제는 import `:61` · `const gdeltOn` `:122` · 생성 `:123-125` · 주입 `globalImpact,` `:141`. **4차가 이 목록을 "전부 정확했다"고 명시한 자리**다 — 재실측했다고 적었으나 이 네 개는 대조하지 않았다.
  - **(B) 같은 표의 재개 행 `index.ts:116` → `:121`** (§1-A) — `const resume = …RESUME…`는 `:121`이다.
  - **(B) `useNewsprintSkin.ts` 줄 번호 정정** (§1-B 뉴스프린트 스킨 행 · G13 · `docs/design/a3-ui-ux.md` 머리 경고) — 4차가 "세 문서에 복사된 틀린 범위"를 고치면서 **틀린 값을 세 곳에 다시 복사했다.** 실제는 `:18` docblock 닫는 ` */` · `:19` 선언 · `:23` 판정 · `:24` `return !isDark;` · `:25` 닫는 `}`. 4차가 인용한 `return !isDark;` `:25`는 실제로는 `:24`다. 파일은 그 사이 수정된 적이 없으므로 코드 이동이 아니다. → **교훈: 복사본을 한꺼번에 고치는 작업은 틀린 값도 한꺼번에 퍼뜨린다. 고친 값 자체를 원본과 한 번 더 대조할 것.**
  - **(B) `daily-pipeline.yml:19-27` → `:25-26`** (§1-A cron 행 · `docs/DEPLOYMENT.md` 3단계 · `docs/production-readiness.md` §1) — 주석 처리된 것은 `# schedule:`(`:25`)과 `#   - cron: "0 20 * * *"`(`:26`) 두 줄이다. 인용 범위는 시작이 한 줄 밀렸고 끝은 **주석이 아닌 `workflow_dispatch:`(`:27`)까지 삼키고 있었다** — 살아 있는 트리거를 "꺼져 있다"는 근거 안에 넣은 셈이다. **결론("cron이 꺼져 있다")은 맞다.**
  - **마이그레이션 4개 → 5개, 마지막 사본** (`docs/design/design-decisions.md` §1 표 #1행) — 6차가 README·DEPLOYMENT·a2 세 곳을 고치면서 이 문서를 빠뜨렸다. **이 문서는 스스로를 "설계 충돌 시 우선 기준"이라 선언하므로**, 여기가 낡으면 다른 문서를 되돌리는 근거가 된다. 5개 파일 이름을 전부 적고 `0005`가 만든 `pipeline_checkpoints`와 그것을 쓰는 코드 위치까지 명시했다.
  - 판정(✅/△/❌)이 바뀐 행은 **없다** — 줄 번호·상태 기술 정정뿐이다. 다만 G11 "남은 것 3"과 §1-A CI 행의 ⚠️ 두 건은 **해소**로 바뀌었다.
  - **이번 감사의 교훈 하나**: 6차까지 반복된 실패는 "줄 번호를 안 적어서"가 아니라 **"적은 줄 번호를 다시 안 읽어서"** 생겼다. 심볼명을 함께 적는 규칙은 그 자체로는 검증이 아니다 — 인용문과 파일을 나란히 놓고 대조하는 절차가 있어야 한다.
