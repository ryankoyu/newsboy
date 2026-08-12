# 실서비스화 필요 기능 정리 (Production Readiness)

Newsboy (구 가칭 BRIEFLY) — 2026-07-13 작성 · **2026-08-12 갱신**
현재 상태: 화면 8종(홈·기사뷰어·저장·설정·아카이브·about·온보딩·**admin 검수 콘솔**) + 파이프라인 + 테스트 **494개**(web 269 / pipeline 225, 2026-08-12 재실행 실측, 전부 통과). 이 문서는 "지금 코드"와 "돈 받고 운영하는 서비스" 사이에 무엇이 필요한지 정리한다.

> ⚠️ **"지금 코드"는 로컬 작업 트리 기준이다.** 아래 판정 중 일부(반려 재생성 배치, CI 워크플로 등)는 아직 커밋되지 않은 파일에 들어 있어 GitHub에는 없다 — `docs/feature-status.md` G14 참조.

우선순위: 🔴 출시 차단(없으면 서비스 불가) / 🟡 출시 직후 필요 / 🟢 성장 단계

> 상태 표기 원칙: **✅는 실제로 동작하는 것을 본 항목에만 쓴다.** 코드가 있다는 것만으로는 ✅가 아니다. 기능별 상세 판정은 `docs/feature-status.md`가 단일 기준.

---

## 1. 인프라·연결 🔴

| 항목 | 내용 | 현재 상태 (2026-08-12 실측) |
|---|---|---|
| Supabase 프로젝트 | DB 실연결 (파이프라인 쓰기) | ✅ **연결 완료.** 프로젝트 생성 + 마이그레이션 0001~0004 적용 + 시크릿 등록. (⚠️ 그 뒤 2026-08-12에 `0005_pipeline_checkpoints.sql`이 추가돼 마이그레이션은 **총 5개**다 — 이 프로젝트의 실 DB에 0005가 적용됐는지는 **확인되지 않았다**. 적용 전이면 실행은 되지만 재개만 조용히 안 된다. 확인 쿼리는 `docs/DEPLOYMENT.md` 1단계.) GitHub Actions run `31493703937`에서 실제로 기사 1건을 DB에 기록 (`stage=store ok … "storage":"supabase"` → `finished — status=success articles=1`). ⚠️ **다만 그 실행은 `MAX_ARTICLES=2`였고, 쓰기 뒤 프로세스가 끝나지 않아 26분 뒤 취소돼 GitHub 결론은 `cancelled`다**(2026-08-12 `gh run` 실측). 결론이 success인 다른 supabase 실행 1건은 `llm=mock`이었다 → **에디션 10건을 anthropic으로 만들어 끝까지 쓴 실행은 아직 없다.** cron 재개 전에 (a) 종료되지 않는 원인, (b) 10건 규모 쓰기를 확인할 것 |
| Supabase — 웹 읽기 | 웹사이트가 DB의 실기사를 읽기 | ❌ **미착수.** `web/src/lib/data/`는 여전히 시드 JSON만 읽는다. **파이프라인이 DB에 써도 웹사이트에는 안 나온다** — 지금 가장 큰 실질 병목 |
| Supabase Auth | 로그인·기기 동기화 | ❌ 미착수 (§3) |
| Anthropic API 키 | 매일 재작성 파이프라인 가동 | ✅ **연결 완료, 실호출 중.** 1회 실행 실측 **$1.0366** (`pipeline/output/runs/9ff5ad29-….json` `costSummary.estimatedUsd`). 매일 1회 기준 월 약 $31 — 다만 실행 1회 표본이라 기사 수·재시도 횟수에 따라 변동. **여러 날 누적 후 재확정 필요** |
| GitHub 리포지토리 | Actions 스케줄 실행에 필요 | ✅ **완료.** `https://github.com/ryankoyu/newsboy.git`. Actions 실행 이력 5건, 시크릿 3종 등록됨 |
| 파이프라인 자동 실행(cron) | 매일 새벽 5시 KST | ❌ **꺼져 있다.** `.github/workflows/daily-pipeline.yml:25-26`에서 `schedule:` 블록(`# schedule:` / `#   - cron: "0 20 * * *"`)이 주석 처리됨(커밋 `df71e3b`, 줄 번호 2026-08-12 7차 재실측 — 이전 판의 `:19-27`은 범위가 어긋나 있었다) — 1회 $1.04를 아직 아무도 안 보는 산출물에 쓰지 않기 위한 의도적 중단. 웹 읽기 어댑터가 붙은 뒤 주석 해제. 참고: 중단 전 스케줄이 1회 발동해 **실패**했다(2026-08-10T22:07Z, 22초 만에 failure) — 재개 전 원인 확인 필요 |
| 도메인 + 배포 | Vercel 배포, 도메인 구입(네이밍 확정과 연동) | ❌ 미착수 |

## 2. 운영자 검수 콘솔 🟡 — 구현 완료, Supabase 연결이 남음

자동발행 금지 원칙상, **매일 아침 승인 버튼을 누를 화면**이 필요하다. 2026-08-11 기준 이 화면은 구현돼 있다(커밋 `cb67b60`·`8f599fd`).

| 요구사항 | 상태 | 구현 위치 |
|---|---|---|
| 검수 대기 에디션 조회 (기사 10개 × 3레벨 본문 + 단어) | ✅ | `web/src/app/admin/page.tsx` · `admin/[date]/page.tsx` |
| 품질 게이트 결과 표시 (CEFR·원문 중복률·단어-본문 일치·2소스) | ✅ | `web/src/lib/admin/gateStatus.ts` (`deriveGateStatus`·`checkBadgeState`·`findCheck`·`ALL_CHECK_KINDS`) — `ReviewClient.tsx:12`에서 import, `:284` `const gate = deriveGateStatus(article)`, `:432` `<CheckBadge kind={kind} state={checkBadgeState(findCheck(version, kind))} />` |
| 사실별 소스 링크(provenance) 확인 | ✅ | `ReviewClient.tsx:475` `{/* Provenance */}` 블록 — `:478` 요약행 「사실·소스 (facts N · sources N)」 · `:481` `article.facts.map`(2소스+/단일소스 배지, 확인 매체) · `:513` `article.sources.map`(외부 링크) |
| 기사별 승인/제외, 에디션 발행 버튼 | ✅ | `web/src/app/admin/actions.ts` 서버 액션 **8개** (승인 `:14` · 제외 `:26` · 반려 `:56` · 결정 초기화 `:75` · 발행 `:95` · 로그아웃 `:110` · 리드 기사 지정 `:122` · 일괄 승인 `:149`) + `web/src/lib/admin/publishEdition.ts` |
| 접근 보호 (운영자 로그인) | ✅ | `web/src/lib/admin/auth.ts` · `admin/login/page.tsx` |
| **반려(재생성 요청)** | ✅ | **2026-08-12 정정 — 구현돼 있다.** 버튼 `ReviewClient.tsx:610` "반려 (재생성 요청)" → `requestRegenerationAction(editionDate, articleId, note)` (`actions.ts:56`, **사유 필수**) → 기사 결정을 `"regenerate"` + 사유로 기록. 사유는 재작성 지시문으로 모델에 그대로 전달된다(`ReviewClient.tsx:309` 주석). 파이프라인 쪽 처리기: `pipeline/src/pipeline/regenerate.ts` + `src/scripts/run-regenerate.ts`, 실행은 `npm run regenerate -- <날짜>`. 검수 화면이 운영자에게 그 명령을 안내한다(`ReviewClient.tsx:187,193-194`). ⚠️ **반자동이다** — 콘솔이 파이프라인을 직접 부르지는 않고, 사람이 터미널에서 배치를 돌린다. 반려→재생성→재검수 한 바퀴를 실제로 돌려본 기록은 아직 없다(단위 테스트 `regenerate.test.ts`만 있음) |

> ⚠️ **줄 번호 재실측 (2026-08-12).** 위 표의 게이트 행은 `ReviewClient.tsx:17-21`을, provenance 행은 `:442-445`를 근거로 대고 있었는데, 실제로 그 줄에 있는 것은 각각 **서버 액션 import 문**과 **기사 제목 렌더링**이었다. 기능은 둘 다 있고 줄 번호만 다른 코드를 가리킨 것이지만, 대조하려던 사람은 근거를 못 찾는다. 위 셀은 현재 트리 기준으로 다시 실측했고, `feature-status.md` G5의 교훈대로 **함수·심볼 이름을 함께 적었다** — 줄 번호만 남기면 코드가 조금만 움직여도 문서가 거짓이 된다.

**남은 작업 (🔴 — 이것 없이는 실서비스 발행 불가)**
- **Supabase 리포지토리 구현.** 지금 검수 콘솔은 `web/src/lib/admin/localFsEditionRepository.ts`로 로컬 `pipeline/output/`을 직접 읽는다. 이 폴더는 `.gitignore` 대상이라 Vercel에는 아예 없고, 그래서 배포 환경에서는 안내 화면만 뜬다(`web/src/lib/admin/availability.ts`). `editionRepository.ts` 인터페이스의 Supabase 구현이 있어야 서버에서 검수가 가능하다.
- 발행 대상도 마찬가지다. `publishEdition.ts`는 승인분을 **웹 시드 JSON으로** 쓴다 — 즉 지금 발행은 "코드 저장소를 고치는" 행위다. DB 발행으로 옮겨야 한다.

## 3. 인증·사용자 데이터 🔴

- Supabase Auth 실연결 (이메일 + Google 로그인) — 현재 localStorage 세션을 SessionStore 인터페이스 뒤에서 교체
- 기기 간 동기화 (레벨·단어장·북마크·읽음)
- 회원 탈퇴 + 데이터 삭제 (개인정보보호법 요건)

## 4. 법무·정책 🔴

- 이용약관·개인정보처리방침 (한국법 기준, 결제 도입 시 전자상거래법 추가)
- **저작권 변호사 자문** — R4가 준비한 질문 6개 (docs/research/r4-copyright-legal.md 말미)
- 출처 표기 문구 확정, 기사 하단 고지 문안
- 사업자 등록 여부 검토 (유료화 시 필수)

## 5. 안정 운영 🟡

- **CI(테스트 자동 실행)** — `.github/workflows/ci.yml`이 작업 트리에 작성돼 있다(push·pull_request마다 pipeline typecheck+test, web test+build, Node 22, 시크릿 불필요). **아직 커밋되지 않아 GitHub에는 없고 실행 이력도 0건이다** — 커밋 전까지 "테스트 494개 통과"는 누군가 그날 로컬에서 돌렸을 때만 참이다
- 파이프라인 실패 알림 (아침 5시 실행 실패 시 운영자에게 이메일/슬랙 — 뉴스가 안 올라온 채 하루가 시작되는 사고 방지)
- 에러 모니터링 (Sentry 등), 업타임 모니터링
- DB 백업 정책 (Supabase Pro 자동 백업)
- RSS 소스 헬스체크 (소스가 조용히 죽는 것 감지 — 주간 리포트)
- 콘텐츠 아카이브 정책 (지난 에디션 보관·노출 기준)

## 6. 성장·마케팅 기반 🟡

- SEO: 기사별 메타태그 ✅ 구현됨 (`web/src/app/article/[slug]/page.tsx:48` `generateMetadata`) / **OG 이미지·sitemap은 아직 없음** (뉴스 콘텐츠가 검색 유입 자산)
- 방문 분석 (GA4 또는 프라이버시 친화 대안)
- 아침 알림: 웹 푸시 또는 이메일 뉴스레터 ("Your Daily Brief가 도착했습니다" — 리텐션의 핵심)
- 지난 에디션 브라우징 + 검색
- 공유 기능 (기사 카드 공유 — 자연 유입 루프)

## 7. 학습 기능 확장 (V1.5~V2, 브리핑 문서 로드맵과 일치) 🟢

- 퀴즈 (사용자 지시로 MVP 제외 — 스키마는 준비됨)
- TTS 쉐도잉 (문장 재생 + IPA→실음성)
- 복습 시스템 (저장 단어 간격 반복 + 저녁 알림)
- AI Conversation (기사 기반 영어 대화 + 교정)
- 관심사 큐레이션, Progress 대시보드
- Sentence Compare (문장 클릭 → 3레벨 비교)

## 8. 수익화 🟢

- Premium 설계 (주의: R2 조사 — 뉴스 열람 자체 유료화 선례 없음. 부가기능 유료화가 업계 표준)
- 결제 연동 (Stripe 또는 토스페이먼츠), 구독 관리
- B2B/기업용은 수요 검증 후

## 9. 품질 고도화 🟢

- CEFR 검사기를 실 빈도 코퍼스로 보강 (현재 소규모 휴리스틱)
- 클러스터링 임베딩 교체 (현재 어휘 유사도)
- 단어 뜻/발음 사전 API 검증
- 접근성 감사 (스크린리더 실사용 테스트)

---

## 출시까지의 최단 경로 (2026-08-11 재작성)

**완료된 단계** (원래 1·2번이었던 것)
- ~~Supabase 결정 + API 키 → 실데이터 파이프라인 가동, 비용 실측~~ → ✅ 파이프라인이 실 DB에 쓴다. 1회 $1.0366 실측.
- ~~GitHub 리포~~ → ✅ `ryankoyu/newsboy`, Actions 동작.
- ~~운영자 검수 콘솔 구현~~ → ✅ 화면·승인·발행·로그인 모두 구현. 단 **로컬 전용**.

**남은 순서**

0. **미커밋 작업 커밋·push** (2026-08-12 추가) — Layer 2 GDELT 신호·Layer 3 편집회의·반려 재생성 배치·체크포인트 재개·`ci.yml`이 아직 커밋되지 않은 파일에 있다(feature-status.md G14). GitHub에 없으면 Actions는 옛 코드를 돌리고, CI도 돌지 않는다. 아래 어떤 단계보다 먼저다.
1. **웹 ↔ Supabase 읽기 어댑터** (§1) — 지금 파이프라인 결과물과 웹사이트 사이가 끊겨 있다. 이걸 붙여야 "매일 자동으로 새 뉴스가 뜬다"가 성립한다. **최우선.**
2. **검수 콘솔의 Supabase 리포지토리** (§2) — 로컬 파일 대신 DB를 읽고, 발행도 시드 JSON이 아니라 DB에 하도록. 1번과 같은 어댑터 층을 공유한다.
3. **Vercel 배포 + 도메인** (네이밍 확정 포함) — 1·2가 끝나야 배포된 사이트가 의미를 갖는다.
4. **cron 재개** — 1~3 이후 `daily-pipeline.yml`의 `schedule:` 주석을 해제. 재개 전에 2026-08-10 스케줄 실행이 22초 만에 실패한 원인을 먼저 확인할 것.
5. **인증 실연결** (§3)
6. **법무 패키지** (§4) — 배포와 병행 가능
7. **알림·모니터링** (§5) → **소프트 런칭**
8. §6(성장) → §7(학습 확장) → §8(수익화) 순으로 확장

> 순서가 바뀐 이유: 원래 계획은 "검수 콘솔이 가장 큰 미구현 기능"이라고 봤는데, 콘솔은 만들어졌고 정작 **파이프라인 → 웹 사이의 데이터 경로**가 비어 있는 것이 드러났다. 지금은 파이프라인이 DB에 기사를 써도, 검수 콘솔은 로컬 파일을 보고, 웹사이트는 시드 JSON을 본다 — 세 곳이 서로 다른 데이터를 보고 있다. 그 셋을 DB 한 곳으로 모으는 것이 남은 일의 핵심이다.
