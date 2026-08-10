# 배포 체크리스트 (Vercel + Supabase)

Newsboy (구 가칭 BRIEFLY) — 2026-08-10, 메인 에이전트 작성. 비개발자가 오늘 아침 순서대로 따라 하는 문서.

> 표시 없는 항목 = 코드로 직접 확인함(`[관찰]`). `[문서]`는 Vercel/Supabase 공식 문서 기준으로 적었지만 이 환경에서 실제로 배포해보며 검증하지는 못한 부분(외부 서비스 계정 생성 자체가 이번 작업 범위 밖) — 그대로 따라 하면 되지만, 화면 문구가 이 문서와 살짝 다를 수 있다.

---

## 이번 배포에서 되는 것 / 안 되는 것 (먼저 읽기)

**된다**
- `*.vercel.app` 주소로 접속하는 반응형 웹앱 — 홈(Top10)·기사뷰어(A2/B1/B2 전환)·Smart Dictionary·저장·설정·아카이브 화면.
- 콘텐츠는 웹앱에 내장된 **시드(샘플) 데이터** — `web/src/lib/data/seed/`의 고정 JSON. 실제 기사 2건 + 나머지는 예시 데이터.
- 브라우저 저장 학습 데이터 — 레벨 선택, 글자 크기, 테마, 저장한 단어/문장, 읽음 표시 등은 `localStorage`에 남는다. **같은 브라우저에서만** 유지되고, 다른 기기·브라우저와 동기화되지 않는다.

**안 된다 (이번 배포 범위 밖 — 남은 연결 작업)**
- **로그인 / 기기 간 동기화** — Supabase Auth가 코드에 연결돼 있지 않다. 지금은 로그인 자체가 없다.
- **Vercel 위의 검수 콘솔(`/admin`)** — 검수 콘솔은 파이프라인이 로컬에 남긴 파일(`pipeline/output/`)을 직접 읽는 구조인데, 이 폴더는 `.gitignore`에 걸려 있어 GitHub에 올라가지 않는다. 그래서 Vercel에는 애초에 그 파일이 없다. 500 에러 대신 "검수 콘솔은 Supabase 연결 후 사용 가능합니다" 안내 화면이 뜨도록 만들어 뒀다 — 정상 동작이다, 고장이 아니다.
- **파이프라인 → 웹사이트 자동 반영** — GitHub Actions로 파이프라인을 돌려 `STORAGE=supabase`로 Supabase에 기사를 써도, 지금 웹사이트는 아직 그 데이터를 읽지 않는다(위 "된다" 항목의 시드 데이터만 보여줌). 웹 쪽에 Supabase를 읽는 어댑터가 아직 없기 때문 — `docs/production-readiness.md` §1·§2·§3에 이미 정리된 남은 작업이다.
- 요약하면: **오늘 배포는 "웹사이트가 인터넷에 뜬다"까지다.** 실데이터가 실사용자에게 자동으로 도달하는 것은 다음 단계.

---

## 0단계 — GitHub 리포지토리 만들고 push

1. github.com에서 새 리포지토리 생성 (Private 권장 — 아직 법무 문서·요금제 검증 전).
2. 로컬에서:

```bash
cd /Users/koyu/Documents/GitHub/Branding/English_News
git remote add origin https://github.com/<계정명>/<리포이름>.git
git push -u origin main
```

**확인 방법**: GitHub 리포 페이지 새로고침 → 파일 목록이 보이면 성공.

**안 될 때 흔한 원인**
- `remote origin already exists` → `git remote set-url origin <URL>`로 바꾸기.
- push 인증 실패 → GitHub가 비밀번호 로그인을 막은 지 오래됐다. Personal Access Token 또는 `gh auth login`(GitHub CLI) 사용.

---

## 1단계 — Supabase 프로젝트 생성 + 마이그레이션 실행

1. supabase.com → New Project. 리전은 서울(ap-northeast-2)이 없으면 가까운 도쿄(ap-northeast-1) 선택 — 응답속도에 유리.
2. 프로젝트 생성 완료(1~2분 대기) 후 좌측 메뉴 **SQL Editor** 이동.
3. `supabase/migrations/0001_schema.sql` 파일 내용을 전부 복사 → SQL Editor에 붙여넣기 → Run.
4. 이어서 `supabase/migrations/0002_user_library.sql` 내용도 같은 방식으로 Run. **순서 중요 — 0001 먼저, 0002 나중.**
5. 좌측 메뉴 **Project Settings > API**에서 키 3개 복사해 메모장 등에 잠시 보관:
   - **Project URL** (`SUPABASE_URL`)
   - **anon / public key** (`SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`) — ⚠️ 이 키는 절대 브라우저·공개 코드에 넣지 않는다.

**확인 방법**: SQL Editor에서 `select count(*) from articles;` 실행 → 에러 없이 `0`이 나오면 테이블이 정상 생성된 것.

**안 될 때 흔한 원인**
- 0001 실행 중 에러 → 0002를 먼저 돌렸거나, 이전 실패한 실행이 테이블 일부를 남긴 경우. **Database > Tables**에서 남은 테이블을 지우고 0001부터 다시.
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
   | `ADMIN_PASSWORD` | 직접 정한 비밀번호 | 검수 콘솔용 — 지금은 Vercel에서 못 씀(위 "안 되는 것" 참고)이지만 로컬 개발과 통일해 미리 넣어둠 |
   | `SUPABASE_URL` | 1단계에서 복사 | 지금 코드는 아직 안 읽음 — 나중 연결 대비 미리 등록 |
   | `SUPABASE_ANON_KEY` | 1단계에서 복사 | 위와 동일 |
   | `SUPABASE_SERVICE_ROLE_KEY` | 1단계에서 복사 | 위와 동일. 절대 `NEXT_PUBLIC_` 접두사 붙이지 않기 |

4. **Deploy** 클릭 → 1~2분 대기.
5. 배포 완료 화면의 `*.vercel.app` 링크 클릭.

**확인 방법**: 홈 화면(Top10 카드)이 뜨는지, 기사를 눌러 A2/B1/B2 전환이 되는지 확인. `/admin`은 로그인 화면 대신 "검수 콘솔은 Supabase 연결 후 사용 가능합니다" 안내가 뜨는 게 **정상**이다.

**안 될 때 흔한 원인**
- 빌드 실패 + 로그에 `Cannot find module` → Root Directory가 `web`으로 안 잡혔을 가능성. Project Settings > General > Root Directory 재확인.
- 빌드는 성공했는데 화면이 흰 페이지 → 브라우저 콘솔(F12) 에러 확인, 대부분 환경변수 오타.
- `/admin` 접속 시 500(안내 화면이 아니라 진짜 에러 페이지) → 이 작업에서 만든 안전장치가 깨진 것. `web/src/app/admin/layout.tsx`·`web/src/lib/admin/availability.ts` 확인 필요 — 개발팀에 문의.

---

## 3단계 — GitHub Actions 시크릿 등록 + 파이프라인 수동 실행

파이프라인(`daily-pipeline.yml`)은 Vercel이 아니라 **GitHub Actions**에서 매일 새벽 5시(KST)에 자동 실행되도록 이미 짜여 있다. 실행하려면 시크릿을 등록해야 한다.

1. GitHub 리포 → **Settings > Secrets and variables > Actions > New repository secret**로 아래 3개 등록 (`pipeline/.env.example` 참고):
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (anon 키 아님 — service_role)
2. **Actions** 탭 → `daily-pipeline` 워크플로 선택 → **Run workflow** (수동 실행 버튼).
   - `llm_provider`는 처음엔 `mock`으로, `storage`는 `local`로 테스트해보는 걸 권장 — 비용·Supabase 오염 없이 파이프라인이 끝까지 도는지만 먼저 확인.
   - 문제없으면 다음 실행은 `anthropic` + `supabase`로.

**확인 방법**: Actions 탭에서 해당 실행 클릭 → 로그 끝에 `[pipeline] finished — status=...` 확인. `storage=local`로 돌렸다면 실행 페이지의 **Artifacts**에서 `pipeline-output-...` 다운로드해 결과물(JSON) 확인 가능.

**안 될 때 흔한 원인**
- `ANTHROPIC_API_KEY` 관련 인증 에러 → 아래 "API 키 회전" 참고. 새 키 발급했는지 확인.
- `storage=supabase`로 돌렸는데 테이블 에러 → 1단계 마이그레이션이 실제로 적용됐는지(0001→0002 순서) 재확인.
- 스케줄(cron)이 자동으로 안 도는 것처럼 보임 → 정상이다, GitHub Actions 스케줄은 등록 후 실제 발동까지 다소 지연될 수 있고, 무엇보다 이번 작업에서는 아직 **한 번도 자동으로 돌지 않았다** — 수동 실행으로 먼저 검증하는 게 이 단계의 목적.

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

1. **웹 ↔ Supabase 읽기 어댑터** — `web/src/lib/data/provider.ts`의 `DataProvider`를 Supabase 구현으로 교체. 이게 있어야 파이프라인이 만든 실제 기사가 웹사이트에 나온다.
2. **검수 콘솔의 Supabase 연결** — `web/src/lib/admin/editionRepository.ts` 인터페이스를 구현하는 Supabase 버전 추가. 이게 있어야 Vercel 위에서 `/admin` 사용 가능(지금은 안내 화면만 뜸).
3. **Supabase Auth 연결** — 로그인·기기 동기화. `web/src/lib/session.ts`의 `SessionStore` 인터페이스 뒤로 교체.
4. **파이프라인 자동 스케줄 첫 실측** — 수동 실행이 성공한 뒤, 실제 새벽 5시 cron이 도는지 며칠 지켜보기 + 비용 실측(월 $70~150 추정치 검증).

법무(이용약관·개인정보처리방침·저작권 자문)는 `production-readiness.md` §4 — 배포와 별개로 병행 진행.
