# 배포 체크리스트 (Vercel + Supabase)

Newsboy (구 가칭 BRIEFLY) — 2026-08-10 작성 · **2026-08-12 갱신**. 비개발자가 순서대로 따라 하는 문서.

> **2026-08-11 진행 상황**: 0단계(GitHub 리포)와 1단계(Supabase)·3단계(Actions 시크릿·수동 실행)는 **이미 완료됐다.** 남은 것은 2단계(Vercel 배포)다. 아래 완료 단계는 "다시 하라"가 아니라 "이렇게 돼 있다"는 기록으로 읽을 것.

> 표시 없는 항목 = 코드로 직접 확인함(`[관찰]`). `[문서]`는 Vercel/Supabase 공식 문서 기준으로 적었지만 이 환경에서 실제로 배포해보며 검증하지는 못한 부분(외부 서비스 계정 생성 자체가 이번 작업 범위 밖) — 그대로 따라 하면 되지만, 화면 문구가 이 문서와 살짝 다를 수 있다.

---

## 이번 배포에서 되는 것 / 안 되는 것 (먼저 읽기)

**된다**
- `*.vercel.app` 주소로 접속하는 반응형 웹앱 — 홈·기사뷰어(A2/B1/B2 전환)·Smart Dictionary·저장·설정·아카이브 화면.
- **파이프라인 → Supabase → 독자 화면이 이어져 있다** (2026-08-12). 위 2단계의 `NEXT_PUBLIC_SUPABASE_*` 두 개를 넣으면 사이트가 라이브 기사를 읽는다. 검수 콘솔에서 발행하면 커밋·푸시 없이 그 순간 반영된다.
  - 라이브 검증: 저장된 기사를 발행 → anon 키로 A2/B1/B2·출처 19곳·단어 5개·slug 조회 확인 → 다시 review 로 복구. `web/src/lib/data/supabase-provider.ts`, `web/src/lib/admin/publishToSupabase.ts`.
- 환경변수를 **안 넣으면** `web/src/lib/data/seed/`의 시드 JSON으로 되돌아간다. 이건 목업이 아니라 2026-07-13 에디션의 실제 산출물이고, 자격 정보 없이도 앱이 동작하게 하는 안전망이다.
- 브라우저 저장 학습 데이터 — 레벨, 글자 크기, 테마, 저장한 단어/문장, 읽음 표시는 `localStorage`에 남는다. **같은 브라우저에서만** 유지된다. 설정 화면에서 내보내기·가져오기 가능.

**안 된다 (남은 연결 작업)**
- **로그인 / 기기 간 동기화** — Supabase Auth가 연결돼 있지 않다. 폰과 컴퓨터가 서로의 저장 기록을 모른다.
- **Vercel 위의 검수 콘솔(`/admin`)** — 콘솔은 구현이 끝났고 로컬에서 동작한다(승인·제외·리드 지정·일괄 승인·발행). 다만 파이프라인이 로컬에 남긴 `pipeline/output/`을 읽는 구조라 배포본에는 그 파일이 없다. 빈 표 대신 안내 화면을 띄운다(`web/src/lib/admin/availability.ts`) — 고장이 아니다. **즉 검수와 발행은 운영자 컴퓨터에서 한다.** 서버에서 하려면 `editionRepository.ts`의 Supabase 구현이 필요하다.
- **하루치 분량** — RSS 요약만 수집하는 현재 구성에서는 "2곳 이상이 확인한 사실 3건" 기준을 통과하는 기사가 하루 1~2건이다. 기준을 낮추는 것은 이 제품의 유일한 약속을 깎는 일이라 미결로 둔다.

---

## 0단계 — GitHub 리포지토리 ✅ **완료 (2026-08-11)**

리포는 이미 만들어져 있고 push도 끝났다.

- 리포: **`https://github.com/ryankoyu/newsboy.git`** (`.git/config`의 `remote "origin"`)
- Actions 실행 이력 5건 (2026-08-11 `workflow_dispatch` 4건 + `schedule` 1건)

**할 일 없음.** 새로 리포를 만들지 말 것 — 이미 있는 것에 push하면 된다.

<details>
<summary>(참고) 처음부터 만들 때의 절차</summary>

```bash
cd /Users/koyu/Documents/GitHub/Branding/English_News
git remote add origin https://github.com/<계정명>/<리포이름>.git
git push -u origin main
```

- `remote origin already exists` → `git remote set-url origin <URL>`로 바꾸기.
- push 인증 실패 → GitHub가 비밀번호 로그인을 막은 지 오래됐다. Personal Access Token 또는 `gh auth login`(GitHub CLI) 사용.
</details>

---

## 1단계 — Supabase 프로젝트 생성 + 마이그레이션 실행 ✅ **완료 (2026-08-11)**

> 이 프로젝트는 이미 Supabase에 연결돼 있고, 파이프라인이 실제로 기사를 썼다(3단계 참조). 아래는 **새 환경을 다시 세팅할 때**의 절차다.

1. supabase.com → New Project. 리전은 서울(ap-northeast-2)이 없으면 가까운 도쿄(ap-northeast-1) 선택 — 응답속도에 유리.
2. 프로젝트 생성 완료(1~2분 대기) 후 좌측 메뉴 **SQL Editor** 이동.
3. `supabase/migrations/` 안의 **5개 파일을 번호 순서대로 하나씩** 복사 → SQL Editor 붙여넣기 → Run. **순서가 중요하다.**

   | 순서 | 파일 | 무엇을 하나 |
   |---|---|---|
   | 1 | `0001_schema.sql` | 전체 DDL + `pipeline_runs` + RLS 정책 |
   | 2 | `0002_user_library.sql` | 저장한 문장(`saved_sentences`) 확장 |
   | 3 | `0003_article_status_held.sql` | `article_status` enum에 `'held'` 추가 |
   | 4 | `0004_words_pos_and_categories_seed.sql` | `words.is_key` / `words.pos` 컬럼 + `categories` 시드 10행 |
   | 5 | `0005_pipeline_checkpoints.sql` | `pipeline_checkpoints` — 중단된 실행이 이어서 돌기 위한 단계 체크포인트 |

   ⚠️ **0003·0004를 빼먹으면 파이프라인이 쓰기 단계에서 실패한다.** 게이트를 통과 못 한 기사를 `'held'`로 저장하는 순간, 그리고 `words`에 `pos`/`is_key`를 insert하는 순간(`pipeline/src/storage/supabase.ts`) 존재하지 않는 enum 값·컬럼을 참조하기 때문이다. 실제로 이 두 마이그레이션은 2026-08-11 첫 실 DB 실행에서 그 실패를 겪고 나서 추가된 것이다. 0003이 0004와 분리된 이유는 Postgres가 같은 트랜잭션 안에서 방금 추가한 enum 값을 쓰지 못하기 때문이다.

   ⚠️ **0005를 빼먹으면 실행은 되지만 재개가 안 된다.** 체크포인트 쓰기·읽기가 매번 실패하고(로그에 `WARNING: failed to write checkpoint`), 중간에 죽은 실행은 이미 돈을 치른 재작성분을 버리고 처음부터 다시 돈다 — 1회 약 $1.04를 두 번 쓰는 셈이다. 파이프라인이 멈추지는 않으므로 **로그를 안 보면 모르고 지나간다.**
4. 좌측 메뉴 **Project Settings > API**에서 키 3개 복사해 메모장 등에 잠시 보관:
   - **Project URL** (`SUPABASE_URL`)
   - **anon / public key** (`SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`) — ⚠️ 이 키는 절대 브라우저·공개 코드에 넣지 않는다.

**확인 방법**: SQL Editor에서 아래 4개를 실행. 5개 마이그레이션이 다 들어갔는지까지 확인하는 쿼리다.

```sql
select count(*) from articles;                              -- 에러 없이 0 → 0001 적용됨
select count(*) from categories;                            -- 10 → 0004 시드 적용됨
select column_name from information_schema.columns
  where table_name = 'words' and column_name in ('pos','is_key');  -- 2행 → 0004 컬럼 적용됨
select count(*) from pipeline_checkpoints;                  -- 에러 없이 0 → 0005 적용됨
```

**안 될 때 흔한 원인**
- 0001 실행 중 에러 → 순서를 어겼거나, 이전 실패한 실행이 테이블 일부를 남긴 경우. **Database > Tables**에서 남은 테이블을 지우고 0001부터 다시.
- 파이프라인이 `invalid input value for enum article_status: "held"` 또는 `column "pos" of relation "words" does not exist`로 실패 → 0003·0004를 안 돌린 것이다.
- `extension "pgcrypto" does not exist` 류 에러 → 무료 티어에서도 기본 제공되는 확장이라 보통 발생하지 않지만, 발생하면 SQL Editor에서 `create extension if not exists pgcrypto;` 먼저 실행 후 재시도.

---

## 2단계 — Vercel 연결·배포

이 리포는 하나의 GitHub 저장소 안에 `web/`(배포 대상)과 `pipeline/`(GitHub Actions에서만 실행, Vercel과 무관)이 함께 있는 구조다. Vercel의 **Root Directory** 설정으로 "이 저장소에서 `web/` 폴더만 보고 빌드하라"고 알려준다 — `web/`은 자체 `package.json`·`package-lock.json`을 갖고 있어 이 설정만으로 충분하고, 별도 `vercel.json`은 필요 없다. `[문서]` (Vercel 공식 모노레포 가이드 기준 — 이 환경에는 Vercel 계정이 없어 실제 배포로 재검증은 못 했다.)

1. vercel.com → New Project → GitHub 리포 Import (처음이면 GitHub 계정 연결 권한 승인).
2. **Configure Project** 화면에서:
   - **Root Directory**: `web` 선택 (Edit 버튼 → 리포 폴더 목록에서 `web` 선택).
   - **Framework Preset**: Next.js (자동 감지되어야 함).
   - **Build Command / Output Directory**: 비워두고 기본값 사용.
3. **Environment Variables**에 아래를 입력 (`web/.env.example` 참고, 값은 1단계에서 복사한 것 + 직접 정하는 비밀번호):

   | 이름 | 값 | 비고 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 1단계에서 복사 | **필수.** 이게 있어야 독자 화면이 라이브 기사를 읽는다 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1단계에서 복사한 **anon** 키 | **필수.** service_role 키를 여기 넣으면 안 된다 — `NEXT_PUBLIC_`은 브라우저로 전송된다 |

   **둘 다 넣거나, 둘 다 빼거나** — 하나만 넣으면 코드가 경고를 남기고 시드
   데이터로 되돌아간다. 그 상태의 사이트는 살아 있어 보이지만 저장된 예시
   기사를 보여준다. 2026-08-12 확인: `web/src/lib/data/index.ts`.

   **넣지 말아야 할 것**

   | 이름 | 왜 |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | 이 키는 RLS를 통째로 우회한다. 발행은 운영자 컴퓨터에서만 하므로 `web/.env.local`에만 있으면 된다. Vercel에 두면 배포본이 검수를 건너뛸 수 있는 권한을 갖는다 |
   | `ADMIN_PASSWORD` | 검수 콘솔은 배포본에서 동작하지 않는다(로컬 `pipeline/output`을 읽는다). 쓰지 않는 비밀번호를 배포 환경에 두지 않는다 |

4. **Deploy** 클릭 → 1~2분 대기.
5. 배포 완료 화면의 `*.vercel.app` 링크 클릭.

**확인 방법**: 홈 화면(Top10 카드)이 뜨는지, 기사를 눌러 A2/B1/B2 전환이 되는지 확인. `/admin`은 로그인 화면 대신 "검수 콘솔은 Supabase 연결 후 사용 가능합니다" 안내가 뜨는 게 **정상**이다.

**안 될 때 흔한 원인**
- 빌드 실패 + 로그에 `Cannot find module` → Root Directory가 `web`으로 안 잡혔을 가능성. Project Settings > General > Root Directory 재확인.
- 빌드는 성공했는데 화면이 흰 페이지 → 브라우저 콘솔(F12) 에러 확인, 대부분 환경변수 오타.
- `/admin`에서 안내 화면이 아니라 **설명 없는 빈 표**가 뜸 → `availability.ts` 게이트가 안 걸린 것. `web/src/app/admin/layout.tsx`·`web/src/lib/admin/availability.ts` 확인 필요 — 개발팀에 문의. (`ADMIN_ENABLED=false`로 콘솔을 명시적으로 숨길 수도 있다.)

---

## 3단계 — GitHub Actions 시크릿 등록 + 파이프라인 수동 실행 ✅ **완료 (2026-08-11)**

파이프라인(`daily-pipeline.yml`)은 Vercel이 아니라 **GitHub Actions**에서 돈다.

**⚠️ 자동 스케줄은 지금 꺼져 있다.** `daily-pipeline.yml:25-26`에서 `schedule:` 블록 전체(`# schedule:` / `#   - cron: "0 20 * * *"`)가 주석 처리돼 있다(중단 사유는 `:18-24` 주석, 살아 있는 트리거는 `:27` `workflow_dispatch:` 하나뿐 — 2026-08-12 7차 재실측, 이전 판의 `:19-27`은 시작이 한 줄 밀리고 끝은 주석이 아닌 `workflow_dispatch:`까지 삼키고 있었다)(커밋 `df71e3b` "pause the nightly cron"). 이유: 1회 실행에 Anthropic 크레딧 약 $1.04가 드는데, 웹사이트가 아직 그 결과를 읽지 않아 **아무도 안 보는 산출물에 매일 돈을 쓰게 되기 때문**이다. 지금 이 워크플로는 **수동 실행(`workflow_dispatch`) 전용**이다.

**현재 상태** (2026-08-12 `gh run list`·`gh run view` 재실측 — 아래 2026-08-11 판의 "성공 2건"은 사실과 달랐다)

- 시크릿 3종 등록 완료: `ANTHROPIC_API_KEY` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY`
- 실행 이력 5건, 결론은 **success 1 / failure 3 / cancelled 1**

  | run | 트리거 | 설정 | 결론 | 실제로 일어난 일 |
  |---|---|---|---|---|
  | `31493703937` | 수동 | `llm=anthropic` `storage=supabase` `MAX_ARTICLES=2` | **cancelled** (44분 44초) | 13:15:24에 `stage=store ok {…"articles":1…}` → `finished — status=success articles=1`까지 찍었다. **DB에 1건이 실제로 들어간 것은 맞다.** 그런데 그 뒤 프로세스가 종료되지 않아 13:41:44에 `##[error]The operation was canceled.`로 잘렸다 |
  | `31492177112` | 수동 | — | failure | |
  | `31489819663` | 수동 | **`llm=mock`** `storage=supabase` `MAX_ARTICLES=2` | success (7분 11초) | `articles=0` — 목 LLM이라 저장할 기사가 없었다. "파이프라인이 끝까지 돈다"는 확인이지 콘텐츠 확인은 아니다 |
  | `31489735736` | 수동 | — | failure (20초) | |
  | `31436930859` | 스케줄 | — | failure (22초) | cron 중단 전 마지막 발동 (2026-08-10T22:07Z) |

- 정리하면: **파이프라인이 Supabase에 쓸 수 있다는 것까지는 확인됐고, `anthropic` + `supabase`로 에디션 10건을 끝까지 써서 정상 종료한 실행은 아직 없다.** 두 supabase 실행 모두 `MAX_ARTICLES=2`였다.
- ⚠️ cron을 다시 켜기 전에 확인할 것: (a) 스케줄 실행이 22초 만에 실패한 원인, (b) 쓰기 이후 프로세스가 종료되지 않아 취소로 끝난 원인.

<details>
<summary>(참고) 새 환경에서 처음 세팅할 때</summary>

1. GitHub 리포 → **Settings > Secrets and variables > Actions > New repository secret**로 위 3개 등록 (`pipeline/.env.example` 참고). `SUPABASE_SERVICE_ROLE_KEY`는 anon 키가 아니라 service_role.
2. **Actions** 탭 → `daily-pipeline` 워크플로 선택 → **Run workflow** (수동 실행 버튼).
   - 처음엔 `llm_provider=mock` + `storage=local`을 권장 — 비용·Supabase 오염 없이 파이프라인이 끝까지 도는지만 먼저 확인.
   - 문제없으면 다음 실행은 `anthropic` + `supabase`로.
</details>

**확인 방법**: Actions 탭에서 해당 실행 클릭 → 로그 끝에 `[pipeline] finished — status=success` 확인. Supabase로 돌렸다면 그 직전에 `[pipeline] stage=store ok {"editionDate":"...","articles":N,"storage":"supabase"}`가 찍힌다. `storage=local`로 돌렸다면 실행 페이지의 **Artifacts**에서 `pipeline-output-...` 다운로드해 결과물(JSON) 확인 가능.

**안 될 때 흔한 원인**
- `ANTHROPIC_API_KEY` 관련 인증 에러 → 아래 "API 키 회전" 참고. 새 키 발급했는지 확인.
- `storage=supabase`로 돌렸는데 테이블·enum·컬럼 에러 → 1단계 마이그레이션 **5개**(0001~0005)가 다 적용됐는지 재확인(0003·0004 누락이 가장 흔하다). 로그에 `failed to write checkpoint`만 뜨고 실행은 계속된다면 0005 누락이다 — 파이프라인이 멈추지 않으므로 로그를 안 보면 모른다.
- 스케줄이 안 돈다 → **정상이다. cron이 주석 처리돼 꺼져 있다.** 되살리려면 `daily-pipeline.yml`의 `schedule:` 두 줄 주석을 해제한다(KST 새벽 5시 = UTC 전날 20:00). 단, 위의 스케줄 실행 실패 원인을 먼저 확인하고, 웹이 Supabase를 읽게 된 다음에 켜는 것이 순서다.

---

## ⚠️ API 키 회전 (필수)

`pipeline/.env`에 있는 `ANTHROPIC_API_KEY`는 이번 프로젝트 작업 과정에서 Claude와의 대화에 노출된 적이 있는 이력이 있다. **이 키를 그대로 GitHub Actions 시크릿에 등록하지 말 것.**

1. console.anthropic.com → API Keys → 기존 키 **Revoke(폐기)**.
2. 새 키 발급 → 3단계의 `ANTHROPIC_API_KEY` 시크릿에는 **새 키**를 등록.
3. 로컬 `pipeline/.env`도 새 키로 교체.

Supabase 키(anon/service_role)는 오늘 새로 발급하는 것이므로 노출 이력이 없다 — 별도 회전 불필요. 다만 앞으로 이 키들도 대화에 붙여넣지 않도록 주의.

---

## 다음에 할 일 (오늘 배포 이후 남은 연결 작업)

`docs/production-readiness.md`에 이미 정리돼 있는 목록 중, 이번 배포와 직접 관련된 것만 요약:

0. **미커밋 작업 커밋·push** (2026-08-12 추가) — 로컬 작업 트리에만 있고 GitHub에는 없는 파일이 여럿이다(`pipeline/src/pipeline/globalImpact.ts`·`regenerate.ts`·`storage/checkpointFile.ts`·`.github/workflows/ci.yml` 등, `docs/feature-status.md` G14). **Vercel도 GitHub Actions도 GitHub에 있는 코드만 본다** — 커밋하지 않으면 배포·실행되는 것은 옛 코드다. 참고로 `ci.yml`은 push·PR마다 테스트를 돌리는 CI 워크플로인데, 자기 자신이 커밋되지 않아 아직 한 번도 실행된 적이 없다.
1. **웹 ↔ Supabase 읽기 어댑터** — `web/src/lib/data/provider.ts`의 `DataProvider`를 Supabase 구현으로 교체. 이게 있어야 파이프라인이 만든 실제 기사가 웹사이트에 나온다.
2. **검수 콘솔의 Supabase 연결** — `web/src/lib/admin/editionRepository.ts` 인터페이스를 구현하는 Supabase 버전 추가. 이게 있어야 Vercel 위에서 `/admin` 사용 가능(지금은 안내 화면만 뜸).
3. **Supabase Auth 연결** — 로그인·기기 동기화. `web/src/lib/session.ts`의 `SessionStore` 인터페이스 뒤로 교체.
4. **파이프라인 자동 스케줄 재개** — 1·2번이 끝나 실데이터가 실제로 독자에게 도달하게 된 뒤에 `daily-pipeline.yml`의 `schedule:` 주석을 해제한다. 그 전에 2026-08-10 스케줄 실행이 22초 만에 실패한 원인을 확인할 것. 비용은 1회 실행 **$1.0366** 실측 — 매일 1회면 월 $31 안팎이지만 **표본이 1회뿐**이라 며칠 누적 후 재확정 필요.

법무(이용약관·개인정보처리방침·저작권 자문)는 `production-readiness.md` §4 — 배포와 별개로 병행 진행.
