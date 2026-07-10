# A3. UI/UX 설계 + 디자인 시스템 — BRIEFLY MVP

- 작성일: 2026-07-10
- 대상: MVP 5개 화면 (홈 / 기사 뷰어 / Smart Dictionary / 온보딩 / 로그인 정책)
- 목표 독자: **구현 담당(다른 AI)**. 해석의 여지 없이 그대로 코딩할 수 있는 스펙.
- 무드 한 줄: **"출근길에 커피 마시며 받는 아침 브리핑."** 차분하고 신뢰감 있는 성인용 리추얼. 뉴스 앱의 차가움도, 학습 앱의 유치함도 아니다.
- 플랫폼: 웹 우선 + 반응형(모바일→데스크톱). MVP 범위는 project-brief 16장 확정안(Top 10 / 기사 뷰어 / Level Switch / Smart Dictionary / 가입+레벨선택).

> **표기 규칙**: 확정 스펙은 그대로. 근거가 필요한 판단은 `[관찰]`(문서 직접 확인) / `[문서]`(브리프·리서치 근거) / `[추측]`(맥락상 설계 결정)로 표기. 특히 컬러 hex·수치는 설계자가 정한 값이므로 대부분 `[설계 결정]`이며, 메인 에이전트 승인이 필요한 항목은 문서 끝 "결정 필요 사항"에 모았다.

---

## 0. 디자인 토큰 요약 (구현 시 최우선 참조)

모든 값은 CSS Custom Property로 정의한다. 컴포넌트는 raw hex를 직접 쓰지 말고 반드시 토큰을 참조한다.

```css
:root {
  /* ===== Color — Light (기본) ===== */
  --color-bg:            #FAF9F6;  /* 페이지 배경 — 따뜻한 오프화이트(종이 느낌) */
  --color-surface:       #FFFFFF;  /* 카드·팝업 표면 */
  --color-surface-alt:   #F3F1EC;  /* 서브 영역(단어목록·출처 박스) 배경 */
  --color-border:        #E6E2DA;  /* 구분선·카드 테두리 */
  --color-border-strong: #D4CEC2;  /* 입력 필드 테두리 등 강조 경계 */

  --color-text:          #1F1D1A;  /* 본문 기본 텍스트(거의 검정, 살짝 따뜻) */
  --color-text-secondary:#5C574F;  /* 보조 텍스트(메타·설명) */
  --color-text-muted:    #8B857A;  /* 비활성·플레이스홀더 */
  --color-text-invert:   #FFFFFF;  /* 컬러 배경 위 텍스트 */

  --color-accent:        #C8622D;  /* 브랜드 강조 — 로스티드 오렌지(커피/모닝) */
  --color-accent-hover:  #B0561F;
  --color-accent-soft:   #FBEDE3;  /* 강조 배경(pill·선택 강조) */

  --color-link:          #2A6F6B;  /* 출처 링크 — 딥 틸(신뢰감) */
  --color-link-hover:    #1F5350;

  --color-success:       #3B7A57;  /* 완료·정답 */
  --color-danger:        #B4472E;  /* 오답·경고 */
  --color-focus-ring:    #2A6F6B;  /* 포커스 링(접근성) */

  /* 레벨 배지 */
  --level-a2-bg:  #E4F0E8;  --level-a2-fg:  #2E6B44;  /* A2 = 초록(쉬움/안심) */
  --level-b1-bg:  #E7EEF6;  --level-b1-fg:  #2C5C86;  /* B1 = 파랑(중간) */
  --level-b2-bg:  #F1E9F3;  --level-b2-fg:  #6A3C7A;  /* B2 = 보라(도전) */
  --level-orig-bg:#EDEBE6;  --level-orig-fg:#5C574F;  /* Original(후속) = 중립 회색 */

  /* 카테고리 색 (도트/라벨용, 채도 낮게) */
  --cat-world:    #3A6B8A;  /* 🌍 World */
  --cat-korea:    #B4472E;  /* 🇰🇷 Korea */
  --cat-ai:       #6A5ACD;  /* 🤖 AI */
  --cat-tech:     #4A7C9E;  /* 💻 Technology */
  --cat-business: #B07A2E;  /* 💼 Business */
  --cat-finance:  #2E7D5B;  /* 💰 Finance */
  --cat-science:  #5B8A72;  /* 🔬 Science */
  --cat-sports:   #C8622D;  /* ⚽ Sports */
  --cat-culture:  #9E4A6E;  /* 🎭 Culture/Entertainment */
  --cat-lifestyle:#7A8B4A;  /* 🌿 Lifestyle */

  /* ===== Typography ===== */
  --font-en:  'Lora', 'Noto Serif KR', Georgia, serif;      /* 영어 학습 본문 — 세리프(가독성) */
  --font-ui:  'Pretendard', 'Inter', system-ui, sans-serif; /* 한국어 UI·라벨 — 산세리프 */
  --font-mono:'IBM Plex Mono', ui-monospace, monospace;     /* 발음기호 등 */

  /* Type scale (모바일 기준. root 16px) */
  --fs-display: 28px;  --lh-display: 1.25;  /* 화면 큰 제목(인사말) */
  --fs-h1:      24px;  --lh-h1:      1.3;   /* 기사 제목 */
  --fs-h2:      20px;  --lh-h2:      1.35;
  --fs-h3:      17px;  --lh-h3:      1.4;
  --fs-body:    18px;  --lh-body:    1.7;   /* 영어 본문 — 학습용 넉넉한 행간 */
  --fs-ui:      15px;  --lh-ui:      1.5;   /* 한국어 UI 텍스트 */
  --fs-sm:      13px;  --lh-sm:      1.45;  /* 메타·캡션 */
  --fs-xs:      11px;  --lh-xs:      1.4;   /* 배지 안 글자 */

  /* Reading font-size 조절 (본문 전용, 사용자 설정) */
  --reading-scale: 1;  /* 0.875 / 1 / 1.125 / 1.25 — S/M/L/XL */

  /* ===== Spacing (4px 그리드) ===== */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-5: 20px; --sp-6: 24px; --sp-8: 32px; --sp-10: 40px; --sp-12: 48px;

  /* ===== Radius ===== */
  --r-sm: 8px;   --r-md: 12px;  --r-lg: 16px;  --r-pill: 999px;

  /* ===== Shadow (라이트) ===== */
  --shadow-card:  0 1px 2px rgba(31,29,26,.04), 0 2px 8px rgba(31,29,26,.06);
  --shadow-pop:   0 4px 12px rgba(31,29,26,.10), 0 12px 32px rgba(31,29,26,.14);
  --shadow-sticky:0 -1px 0 rgba(31,29,26,.06), 0 -8px 24px rgba(31,29,26,.06);

  /* ===== Motion ===== */
  --ease: cubic-bezier(.2,.7,.2,1);
  --dur-fast: 120ms;  --dur-base: 220ms;  --dur-slow: 360ms;

  /* ===== Layout ===== */
  --content-max: 680px;   /* 기사 본문 최대폭(가독성) */
  --page-max:    1120px;  /* 데스크톱 전체 폭 */
  --tabbar-h:    60px;    /* 모바일 하단 탭 높이 */
  --header-h:    56px;
}
```

```css
/* ===== Color — Dark ===== */
:root[data-theme="dark"], /* 명시 토글 우선 */
:where(:root:not([data-theme])) { } /* 아래는 media 로 기본값 */

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg:            #17161A;  /* 차분한 잉크 그레이(순검정 X — 눈 피로↓) */
    --color-surface:       #1F1E23;
    --color-surface-alt:   #26252B;
    --color-border:        #34333A;
    --color-border-strong: #45444C;

    --color-text:          #ECEAE4;  /* 따뜻한 오프화이트 */
    --color-text-secondary:#B4B0A8;
    --color-text-muted:    #837E76;
    --color-text-invert:   #17161A;

    --color-accent:        #E0824C;  /* 다크에서 밝게 보정 */
    --color-accent-hover:  #EE9560;
    --color-accent-soft:   #3A2A20;

    --color-link:          #5FB3AD;
    --color-link-hover:    #7FC9C3;

    --color-success:       #6FB58C;
    --color-danger:        #E0765A;
    --color-focus-ring:    #5FB3AD;

    --level-a2-bg:#22382B; --level-a2-fg:#7FC79A;
    --level-b1-bg:#1F3346; --level-b1-fg:#7FB0DE;
    --level-b2-bg:#332440; --level-b2-fg:#C79ADB;
    --level-orig-bg:#2C2B31; --level-orig-fg:#B4B0A8;

    --cat-world:#6FA3C4; --cat-korea:#E0765A; --cat-ai:#9A8CE8; --cat-tech:#7FADCB;
    --cat-business:#D6A85C; --cat-finance:#6FBF97; --cat-science:#8FC4A6;
    --cat-sports:#E0824C; --cat-culture:#CE8AA8; --cat-lifestyle:#A9BB7C;

    --shadow-card:  0 1px 2px rgba(0,0,0,.30), 0 2px 8px rgba(0,0,0,.36);
    --shadow-pop:   0 4px 14px rgba(0,0,0,.44), 0 16px 40px rgba(0,0,0,.50);
    --shadow-sticky:0 -1px 0 rgba(0,0,0,.30), 0 -8px 24px rgba(0,0,0,.30);
  }
}
/* 사용자 토글이 있으면 data-theme="dark"/"light"가 root에 찍히고,
   위 media 블록보다 우선한다. dark 값은 data-theme="dark"에도 동일 적용할 것. */
```

> **구현 노트(테마)**: 뷰어 테마 토글은 `<html data-theme="dark|light">`를 stamp한다. 다크 값은 `@media(prefers-color-scheme:dark)`와 `:root[data-theme="dark"]` **양쪽에 동일하게** 정의해 토글이 시스템 설정을 이긴다.

---

## 1. 디자인 시스템

### 1-1. 컬러 팔레트 — 원칙과 근거

**무드 근거** `[설계 결정]`: 아침·커피·종이 신문을 연상시키는 **웜 뉴트럴(오프화이트 + 잉크 블랙)** 을 기본 지면으로 삼고, 브랜드 강조는 **로스티드 오렌지(#C8622D)** 하나로 절제한다. 강조색을 하나로 묶어야 "차분한 리추얼" 톤이 유지된다. 출처 링크만 예외적으로 **딥 틸(#2A6F6B)** 을 써서 "신뢰·검증 가능한 정보"라는 의미를 색으로 분리한다(리서치 r2의 핵심 교훈: 투명한 출처 표기).

**레벨 배지 색 — 신호등 은유** `[설계 결정]`:
- **A2 = 초록**(안심·쉬움, "여기서 시작해도 돼"), **B1 = 파랑**(중간·안정), **B2 = 보라**(도전·상급). Original은 중립 회색(MVP 후속).
- 초록→파랑→보라는 명도 대비가 뚜렷해 색맹 사용자도 순서를 구분하기 쉽다. 단, **색만으로 레벨을 전달하지 않는다** — 배지에는 항상 "A2/B1/B2" 텍스트를 병기(접근성 필수).

**카테고리 색**: 홈 카드의 카테고리 도트/라벨에만 쓰는 저채도 보조 팔레트. 본문 가독성을 해치지 않도록 채도를 낮췄다. 카테고리 색 역시 항상 이모지+텍스트와 함께 쓴다.

**대비(명도) 보장** `[설계 결정]`: 본문 텍스트(`--color-text`) 대 배경(`--color-bg`)은 라이트/다크 모두 WCAG AA(4.5:1) 이상을 목표로 값을 잡았다. 배지 fg/bg 조합도 4.5:1 이상. (구현 후 실제 대비는 검증 도구로 재확인 권장.)

### 1-2. 타이포그래피

**핵심 원칙**: 영어 본문은 **읽기 학습용**이므로 가독성 최우선. 한국어 UI와 영어 본문의 서체를 **의도적으로 분리**한다.

| 용도 | 서체 | 근거 |
|---|---|---|
| **영어 학습 본문** | **Lora**(세리프) | `[설계 결정]` 세리프는 긴 지문에서 글자 구분이 명확하고 "읽는다"는 리추얼 감각을 준다(신문·책의 은유). Lora는 화면 가독성이 좋은 웹폰트. 대안: Source Serif 4, Charter. |
| **한국어 UI·라벨·버튼** | **Pretendard** | `[설계 결정]` 한국어 산세리프 표준급. 숫자·영문 혼용이 자연스럽고 UI에 적합. |
| 한국어가 세리프 본문에 섞일 때 | Noto Serif KR | Lora 폴백으로 지정(뜻풀이 등) |
| 발음기호(IPA) | IBM Plex Mono | 기호 정렬 안정 |

**Type scale**(모바일 기준, 위 토큰 참조):
- 인사말/디스플레이 28 / 기사 제목 24 / 섹션 20 / 서브 17 / **영어 본문 18(행간 1.7)** / UI 15 / 메타 13 / 배지 11.
- **영어 본문 18px·행간 1.7** 이 이 앱의 심장. 학습용 지문은 일반 웹 본문(16/1.5)보다 크고 넉넉해야 한다. `[문서]` 성인 학습자 대상.
- 영어 본문 문단 간격: `margin-bottom: var(--sp-5)`. 한 문단 최대폭 `--content-max(680px)`. 한 줄 45~75자 유지.

**글자 크기 조절**(학습 앱 필수, 3-4 참조): 본문에만 적용되는 `--reading-scale`(S=0.875 / M=1 / L=1.125 / XL=1.25). `font-size: calc(var(--fs-body) * var(--reading-scale))`. UI 텍스트는 스케일 영향받지 않음(레이아웃 안정).

### 1-3. 여백·모서리·그림자

- **여백**: 4px 그리드(`--sp-*`). 카드 내부 패딩 `--sp-4`(16). 섹션 간 `--sp-8`(32). 화면 좌우 세이프 패딩 모바일 `--sp-4`, 데스크톱 `--sp-6`.
- **모서리**: 카드/팝업 `--r-md`(12), 큰 시트 `--r-lg`(16), 버튼/입력 `--r-sm`(8), 배지/pill `--r-pill`. 일관되게 부드럽되 과하지 않게(둥근 정도가 크면 유치해진다).
- **그림자**: 3종만. 카드는 `--shadow-card`(거의 안 보일 만큼 은은), 팝업/시트는 `--shadow-pop`, 하단 sticky 바는 `--shadow-sticky`. 다크에서는 그림자보다 `--color-border`로 층을 구분(그림자는 다크에서 약해 보임).

### 1-4. 컴포넌트 스펙

**버튼**
| 종류 | 배경 | 텍스트 | 테두리 | 용도 |
|---|---|---|---|---|
| Primary | `--color-accent` | `--color-text-invert` | none | 주요 액션(가입, 시작하기, 정답제출) |
| Secondary | `--color-surface` | `--color-text` | 1px `--color-border-strong` | 보조 |
| Ghost | transparent | `--color-accent` | none | 텍스트형 액션 |
| Danger(드묾) | transparent | `--color-danger` | none | 로그아웃 등 |

- 공통: 높이 48px(터치 타깃), 패딩 `0 var(--sp-5)`, radius `--r-sm`, `--fs-ui` 15px/600, `transition: background var(--dur-fast)`. Hover는 `-hover` 토큰. **Disabled**: opacity .45, cursor not-allowed. **최소 터치 타깃 44×44px** 보장.
- Focus: `outline: 2px solid var(--color-focus-ring); outline-offset: 2px`.

**카드**(홈 기사 카드) — 상세는 2-1.
- 배경 `--color-surface`, radius `--r-md`, padding `--sp-4`, shadow `--shadow-card`, 테두리 1px `--color-border`. Hover(데스크톱): shadow 살짝 상승 + `translateY(-2px)`, `--dur-base`. Active(모바일 탭): scale(.99).

**배지**(레벨/카테고리/읽기시간)
- 레벨 배지: `--r-pill`, padding `2px var(--sp-2)`, `--fs-xs` 11px/700, 자간 .02em. bg/fg는 레벨 토큰. 예: A2 → bg `--level-a2-bg` / fg `--level-a2-fg`, 텍스트 "A2".
- 카테고리 라벨: 앞에 6px 도트(카테고리 색) + 이모지 + 한국어/영어 라벨(`--fs-sm`, `--color-text-secondary`).
- 메타(읽기시간): 시계 아이콘 + "3 min", `--fs-sm`, `--color-text-muted`.

**팝업/시트**(Smart Dictionary) — 상세는 2-3.
- 모바일: 하단 bottom-sheet. 데스크톱: 클릭 단어 근처 popover.

**탭**(레벨 스위처 & 하단 네비)
- 레벨 스위처(뷰어 상단): 세그먼트 컨트롤. 트랙 bg `--color-surface-alt`, radius `--r-pill`, 내부 3~4칸. 선택 칸은 `--color-surface` + shadow-card로 떠 보이고 텍스트는 해당 레벨 fg색. 슬라이딩 인디케이터 `--dur-base --ease`.
- 하단 탭바(모바일, 앱 전역): 아이콘+라벨 세로. 활성 `--color-accent`, 비활성 `--color-text-muted`. MVP 탭 = **Home / Saved / Settings** 3개(나머지 IA는 V1.5+). 높이 `--tabbar-h`, `env(safe-area-inset-bottom)` 존중.

**입력 필드**: 높이 48, 테두리 1px `--color-border-strong`, focus 시 테두리 `--color-focus-ring` + 그림자링. radius `--r-sm`. placeholder `--color-text-muted`.

**클릭 가능한 단어(핵심 상호작용 요소)**: 본문 내 단어는 기본적으로 밑줄 없음. Hover/tap 시 배경 `--color-accent-soft` 하이라이트(radius 3px, `--dur-fast`). 이미 조회한 단어는 아주 옅은 점선 하단선(`--color-text-muted` 1px dotted)으로 "본 적 있음" 표시. 3-2 참조.

---

## 2. 화면 설계

각 화면: 모바일 ASCII 와이어프레임 + 상세 설명 + 데스크톱 변형.

### 2-1. 홈 = Daily Brief

```
┌─────────────────────────────┐
│ ☕ BRIEFLY            🌙  ⚙️ │  ← 헤더 56px: 로고 / 테마토글 / 설정
├─────────────────────────────┤
│                             │
│  Good Morning, Ryan. ☀️     │  ← 인사말 display 28px
│  Thursday, July 10          │  ← 날짜 UI 15 secondary
│                             │
│  Your Daily Brief           │  ← h2 20
│  오늘 꼭 알아야 할 뉴스 10개  │  ← UI 15 secondary
│  ⏱ 약 12분 · 레벨 A2         │
│                             │
│  🌍 3 · 🇰🇷 2 · 🤖 2 ·       │  ← 카테고리 요약 칩 (가로 스크롤)
│  💼 2 · 🎭 1                 │
│                             │
│ ┌─────────────────────────┐ │
│ │ ● 🌍 World      [A2] 3min│ │  ← 카드: 도트+카테고리 / 레벨배지 / 읽기시간
│ │                         │ │
│ │ Global chip makers      │ │  ← 기사 제목(영어) h3 17 세리프
│ │ agree on new standard   │ │
│ │                         │ │
│ │ A short summary line in │ │  ← 1줄 프리뷰(영어, secondary)
│ │ your level of English.  │ │
│ │                    ✓읽음 │ │  ← 읽음 표시(선택)
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ ● 🇰🇷 Korea     [A2] 4min│ │
│ │ Seoul unveils new ...   │ │
│ └─────────────────────────┘ │
│           ⋮ (8 more)        │
├─────────────────────────────┤
│   🏠 Home   🔖 Saved   ⚙️   │  ← 하단 탭바 60px
└─────────────────────────────┘
```

**설명**
- **헤더**: 좌 로고(커피 이모지+워드마크), 우 테마 토글(☀️/🌙)·설정(⚙️). 스크롤 시 헤더는 축소 없이 고정, 배경 `--color-bg`에 하단 1px `--color-border`.
- **인사말 블록**: `Good Morning/Afternoon/Evening, {이름}.` — 시간대별 인사(3-4 로직). 비로그인 시 이름 대신 "Good Morning." (2-5 참조). 날짜는 영문 요일+월+일. `[문서]` 브리프 6·8장 "아침 브리핑을 받는다"는 느낌이 홈의 핵심.
- **브리프 요약**: 총 개수·예상 총 읽기시간·현재 레벨. "오늘 이 10개만 읽으면 흐름은 놓치지 않는다"는 신뢰(브리프 10장).
- **카테고리 요약 칩**: 오늘 구성 미리보기. 가로 스크롤 가능. 탭하면 해당 카테고리로 스크롤/필터(MVP는 스크롤 정도, 필터는 후속).
- **기사 카드 리스트**: 세로 스택, 카드 간격 `--sp-3`. 각 카드 상단 행 = 카테고리(도트+이모지+라벨) 좌측 / 레벨 배지 + 읽기시간 우측. 제목은 영어(세리프 17). 그 아래 1줄 프리뷰(현재 레벨 영어). 이미 읽은 기사는 우하단 "✓ 읽음" + 카드 opacity .7(3-3).
- **읽기시간 계산** `[설계 결정]`: 레벨별 단어 수 ÷ 분당 읽기 속도. A2 150단어/B1 310/B2 520를 성인 학습자 속도(A2 ~90wpm, B1 ~120wpm, B2 ~150wpm 가정)로 나눠 반올림. 최소 표기 "1 min". (정확한 wpm은 결정 필요 사항 참조.)
- **레벨 표시 규칙**: 카드의 레벨 배지는 "이 사용자가 지금 읽게 될 레벨"(= 사용자 기본 레벨)을 보여준다. 기사별로 3레벨 모두 존재하지만 카드엔 현재 레벨만 노출.

**빈/로딩 상태**: 3-4 참조.

**데스크톱 변형**(≥1024px)
- 2단 레이아웃: 좌측 240px 사이드 네비(Home/Saved/Settings 세로 + 로고 상단), 우측 콘텐츠(`--page-max` 중앙). 하단 탭바는 숨김.
- 인사말/브리프 요약은 상단 가로 배치. 카드 리스트는 **1열 유지**(680px 중앙 정렬) 또는 최대 2열 그리드 중 택1 — MVP는 **1열 리스트 권장**(브리핑의 "리스트를 훑는다" 감각 유지). 카드 hover 인터랙션 활성.

---

### 2-2. 기사 뷰어 (핵심 화면)

```
┌─────────────────────────────┐
│ ←              🔖   Aa   🌙 │  ← 뒤로 / 저장 / 글자크기 / 테마
├─────────────────────────────┤
│ ● 🌍 World          ⏱ 3 min │  ← 카테고리 + 읽기시간
│                             │
│ Global chip makers agree    │  ← 기사 제목 h1 24 세리프
│ on new standard             │
│                             │
│ ┌───┬───────┬───────┐       │  ← 레벨 스위처(세그먼트) sticky
│ │ A2│  B1   │  B2   │       │     선택칸이 떠 보임
│ └───┴───────┴───────┘       │
├─────────────────────────────┤
│                             │
│  Big companies that make    │  ← 영어 본문 18/1.7 세리프
│  computer chips met this    │     단어 tap 가능
│  week. They agreed on a     │
│  new ⟨standard⟩ for how     │  ← ⟨⟩ = 조회했던 단어(점선)
│  chips will work together.  │
│                             │
│  The deal is important for  │
│  phones and cars ...        │
│                             │
├─────────────────────────────┤
│  📖 Words in this story  ▾  │  ← 단어 목록 섹션(접이식)
│  • standard  표준            │
│  • agree     동의하다         │
│  • deal      거래            │
├─────────────────────────────┤
│  📝 Quick Quiz           ▾  │  ← 퀴즈 섹션
│  Q1. What did the companies │
│      agree on?              │
│   ○ A new standard          │
│   ○ A new phone             │
│   [ 정답 확인 ]              │
├─────────────────────────────┤
│  🔗 Sources                 │  ← 출처 영역(하단)
│  This story is based on:    │
│  • Reuters ↗                │
│  • AP ↗                     │
│  · 사실 확인 후 재작성했습니다 │
└─────────────────────────────┘
```

**설명 (위→아래 순서 = 학습 흐름: 읽기→단어→퀴즈→출처)**

1. **상단 바**(sticky, 56px): ← 뒤로 / 🔖 저장(토글) / **Aa** 글자크기(누르면 S·M·L·XL 팝오버, 3-4) / 🌙 테마. 저장 시 아이콘 채워짐 + `--color-accent`.

2. **기사 헤더**: 카테고리(도트+이모지+라벨) + 읽기시간. 그 아래 제목(세리프 24). `[문서]` 저작권 전략(브리프 14장): **원문 제목 그대로 쓰지 않음** — AI가 재작성한 제목.

3. **레벨 스위처**(핵심 차별점, 브리프 9장): 세그먼트 컨트롤 A2/B1/B2. 제목 아래 배치하고 **스크롤 시 상단 바로 밑에 sticky**(읽는 중 언제든 전환 가능). 전환 시 본문 교체 애니메이션은 3-1. MVP는 A2/B1/B2 3칸(Original은 후속이면 비활성 or 숨김). 선택 상태는 URL 쿼리(`?level=b1`)와 사용자 기본 레벨에 반영.

4. **본문**: 영어 18/1.7 세리프, 폭 `--content-max`. **모든 단어가 클릭 가능**(3-2). 문단 간격 `--sp-5`. 레벨별 분량(A2 ~150 / B1 ~310 / B2 ~520 단어)에 따라 길이가 다르다. 본문 하단에 얇은 진행 게이지(스크롤 진행률) 선택.

5. **Words in this story**(단어 목록 섹션): 접이식(기본 펼침). 이 기사에서 AI가 뽑은 핵심 단어 리스트 — 단어(영어) + 뜻(한국어). 각 항목 탭 시 Smart Dictionary 팝업(2-3)과 동일 내용. 배경 `--color-surface-alt`, radius `--r-md`.

6. **Quick Quiz**(퀴즈 섹션): 접이식. 객관식 2~3문항(MVP). 보기 선택 → [정답 확인] → 정답/오답 피드백(정답 `--color-success` 배경, 오답 `--color-danger`). 해설 1줄. **틀려도 재시도 가능**, 점수 압박 없음(브리프 20장 "공부한다고 느끼지 않게"). 완료 시 기사 "읽음" 처리 트리거 중 하나(3-3).

7. **Sources**(출처 영역, 하단 고정 위치): 배경 `--color-surface-alt`. "This story is based on:" + 복수 원문 링크(딥 틸 `--color-link`, 외부 아이콘 ↗, `target=_blank rel=noopener`). 마지막 줄 고지: "여러 출처의 사실을 확인해 새로 작성했습니다." `[문서]` r2 리서치 핵심 교훈: Breaking News English식 복수 출처 하단 표기를 표준으로. 저작권·신뢰의 근간이므로 **MVP에서도 필수**.

**섹션 순서 이유**: 읽기(본문)→단어→퀴즈→출처. 학습 완결 흐름(브리프 8장 One Brief, One Learning Session)의 MVP 축소판(쉐도잉·AI대화는 후속).

**하단 여백**: 마지막 섹션 아래 `--sp-12` + safe-area. 모바일 탭바는 뷰어에서 **숨김**(몰입 독서). 대신 상단 ← 로 복귀.

**데스크톱 변형**(≥1024px)
- 본문 680px 중앙 정렬. 레벨 스위처는 sticky 유지.
- **선택 사양**: 우측에 단어목록을 사이드로 뺄 수 있으나 MVP는 세로 스택 그대로(단순화). 넓은 화면에서도 본문폭은 680 고정(가독성).
- Smart Dictionary는 bottom-sheet 대신 클릭 단어 옆 popover(2-3).

---

### 2-3. Smart Dictionary 팝업

단어 클릭 시. **번역기가 아니라 학습 사전**(브리프 9장). MVP 필드: 뜻(한국어)·예문·발음. (유의어·표현은 후속.)

**모바일 — Bottom Sheet**
```
┌─────────────────────────────┐
│            (본문 dim)         │
│                             │
│                             │
│ ┌─────────────────────────┐ │  ← 하단에서 slide-up
│ │  ──                     │ │  ← 그랩 핸들
│ │  standard          🔊 🔖│ │  ← 단어 / 발음듣기 / 저장
│ │  /ˈstændərd/            │ │  ← IPA (mono)
│ │  ─────────────────────  │ │
│ │  명 표준, 기준           │ │  ← 품사 + 뜻(한국어)
│ │                         │ │
│ │  In this story:         │ │  ← 예문(기사 속 실제 문장)
│ │  "They agreed on a new  │ │
│ │   standard for chips."  │ │
│ │                         │ │
│ │  [ ＋ 내 단어장에 저장 ]  │ │  ← Primary (후속: My Vocab)
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

**설명**
- 트리거: 본문/단어목록의 단어 tap. 시트가 하단에서 `--dur-base --ease`로 slide-up, 뒤 배경 dim(rgba(0,0,0,.32)). 그랩 핸들 드래그 or 배경 tap or ↓스와이프로 닫힘.
- 내용(위→아래): **단어**(세리프, 강조) + 🔊(발음 재생 — MVP는 TTS 미포함이면 버튼 비활성/숨김, 결정 필요) + 🔖(단어 저장). **IPA 발음기호**(mono). 구분선. **품사 + 한국어 뜻**(문맥에 맞는 뜻 우선). **예문** = "In this story:" 기사 속 실제 문장을 그 단어 하이라이트해서 보여줌(학습 사전의 핵심 — 지금 읽는 맥락과 연결). 하단 저장 버튼.
- **저작권/사실 주의** `[문서]`: 뜻·예문은 사전 데이터 또는 AI 생성. 기사 속 예문은 이미 재작성된 자사 본문 문장이므로 안전. **원문에 없는 뜻·예문을 지어내 넣지 않는다** — 사전 소스가 근거. (CLAUDE.md 규칙 1 준수. 데이터 소스는 백엔드 결정.)
- 한 번 조회한 단어는 본문에서 "본 적 있음" 표시(점선). 3-2.
- 로딩: 시트는 즉시 뜨고 내용 영역만 스켈레톤(단어명은 이미 아니까 바로 표시).

**데스크톱 — Popover**
- 클릭한 단어 근처에 뜨는 popover(max-width 320px, `--shadow-pop`, radius `--r-md`). 화면 경계 넘으면 위/옆으로 flip. 바깥 클릭 or Esc로 닫힘. 내용 구성은 동일.

---

### 2-4. 온보딩 (가입 → 레벨 선택 → 완료)

3단계. 레벨 선택은 **자기 진단 방식(샘플 문장으로 고르게)** — 사용자가 A2/B1/B2 용어를 몰라도 고를 수 있게.

**Step 1 — 가입**
```
┌─────────────────────────────┐
│         ☕ BRIEFLY           │
│  Today's News. Your English.│  ← 슬로건
│                             │
│  ● ○ ○   (1/3)              │  ← 진행 인디케이터
│                             │
│  시작하기                    │
│  ┌─────────────────────────┐│
│  │ 🔵 Google로 계속하기      ││  ← 소셜 우선
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ ✉️ 이메일로 계속하기      ││
│  └─────────────────────────┘│
│                             │
│  나중에 · 먼저 둘러보기       │  ← 비로그인 진입(2-5)
└─────────────────────────────┘
```

**Step 2 — 레벨 선택(자기 진단)**
```
┌─────────────────────────────┐
│  ← 뒤로        ● ● ○  (2/3)  │
│                             │
│  어느 쪽이 편하게 읽히나요?   │  ← 질문(한국어 UI)
│  가장 자연스러운 걸 고르세요  │
│                             │
│ ┌─────────────────────────┐ │
│ │ Big companies that make │ │  ← A2 샘플(영어 세리프)
│ │ chips met this week.    │ │
│ │ They agreed on a new    │ │
│ │ plan.                   │ │
│ │              쉽게 읽혀요 ○│ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Major chipmakers reached│ │  ← B1 샘플
│ │ an agreement this week   │ │
│ │ on a new industry ...   │ │
│ │            적당해요     ○│ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ Leading semiconductor   │ │  ← B2 샘플
│ │ manufacturers have      │ │
│ │ struck a landmark ...   │ │
│ │        술술 읽혀요     ○│ │
│ └─────────────────────────┘ │
│                             │
│  [ 이걸로 시작하기 ]         │  ← 선택 후 활성
│  잘 모르겠어요 → A2로 시작    │  ← 안전한 기본값
└─────────────────────────────┘
```

**Step 3 — 완료**
```
┌─────────────────────────────┐
│              ✅              │
│  준비됐어요, Ryan!           │
│  당신의 레벨: B1             │  ← 배지 색으로
│                             │
│  매일 아침 오늘의 뉴스 10개를 │
│  B1 영어로 브리핑해 드릴게요. │
│                             │
│  언제든 기사에서 A2·B2로     │
│  바꿔볼 수 있어요.           │  ← 레벨 스위처 예고
│                             │
│  [ 오늘의 브리핑 보기 → ]    │  ← Primary → 홈
└─────────────────────────────┘
```

**설명**
- **3단계 고정**(가입→레벨→완료). 관심사 선택은 브리프 7장에 있으나 **MVP 후속**(project-brief 16장 "관심사 큐레이션 미룸")이므로 온보딩에서 제외. 넣는다면 Step 2.5로 추가 가능(결정 필요 사항).
- **레벨 자기 진단**: 같은 뉴스의 A2/B1/B2 샘플 3개를 나란히 보여주고 "가장 자연스러운 것"을 고르게 한다. `[설계 결정]` CEFR 용어를 모르는 성인도 직관적으로 고를 수 있고, 실제 서비스 콘텐츠(레벨 전환)를 온보딩에서 미리 체험시키는 효과. 각 카드에 "쉽게/적당/술술" 한국어 라벨 + 라디오. **"잘 모르겠어요 → A2"** 안전 기본값 항상 제공(A2=초록=안심 은유와 일치).
- 샘플 문장은 **실제 제작된 기사 하나의 3레벨 버전을 재사용**(지어내지 않음, CLAUDE.md 규칙 1). 하드코딩 말고 콘텐츠에서 가져올 것.
- 진행 인디케이터(●○○) 상단 고정. 뒤로 가기 가능.
- 완료 화면에서 선택 레벨을 배지 색으로 축하하고, "언제든 바꿀 수 있다"고 레벨 스위처를 예고해 불안(잘못 골랐으면?)을 해소.

**데스크톱 변형**: 중앙 정렬 카드(max 480px), 배경은 `--color-bg`. 레벨 샘플 3개는 세로 스택 유지(비교 가독성).

---

### 2-5. 로그인 / 비로그인 상태 정책 (제안)

**권장안** `[설계 결정, 결정 필요]`: **비로그인도 읽게 한다 (오늘 Top 10 열람 자유) + 저장/진행 등 개인화는 로그인 유도.**

근거:
- `[문서]` r2 리서치: 뉴스 열람 자체에 페이월을 세운 성공 사례가 조사에서 없었다. 업계 표준은 "뉴스 무료 + 부가로 수익화". 비로그인 차단은 첫 진입 마찰만 키운다.
- 브리프 20장 "Every Feature Must Save Time" + "Curiosity Drives Learning": 궁금해서 들어온 사람을 로그인 벽으로 막으면 호기심 동력이 꺼진다.
- 브리프 13장 BM 제안: Free = Top 10 중 3개. 이는 **유료화(Premium) 경계**이지 로그인 경계가 아니다.

**정책 표**

| 기능 | 비로그인 | 로그인(Free) |
|---|---|---|
| 오늘 Top 10 홈 열람 | ✅ | ✅ |
| 기사 읽기 + 레벨 전환 | ✅ | ✅ |
| Smart Dictionary(뜻·예문) | ✅ | ✅ |
| 단어 저장 / My Vocabulary | ❌ → 로그인 유도 | ✅ |
| 읽음·진행 상태 기억 | ❌(세션 한정) | ✅ |
| 레벨 기본값 저장 | 세션 임시(기본 A2) | ✅ 영구 |
| 퀴즈 풀기 | ✅ | ✅(기록 저장은 로그인) |

- **로그인 유도 시점(soft gate)**: 단어 저장·북마크를 처음 누를 때, 또는 두 번째 기사 완료 후, 하단에 부드러운 배너("저장하려면 로그인하세요 · 매일 아침 브리핑을 받아보세요"). 강제 모달 지양.
- 비로그인 인사말: "Good Morning." (이름 없음). 레벨은 세션 기본 A2 또는 온보딩 없이 진입 시 A2. "먼저 둘러보기"로 진입한 사용자.
- `[문서]` project-brief 13장 Free/Premium 경계는 **MVP 이후** 검증. MVP에서는 유료 티어를 만들지 않으므로, "Top 10 중 3개 제한" 같은 것은 MVP에서 적용하지 않는다(전부 열람). — 결정 필요 사항 참조.

---

## 3. 인터랙션 규칙

### 3-1. 레벨 전환 애니메이션 (핵심)
- 세그먼트 탭 → 선택 인디케이터가 새 칸으로 슬라이드(`--dur-base --ease`).
- **본문 교체**: 현재 본문 `opacity 1→0 + translateY 0→-6px`(`--dur-fast`) → 내용 교체 → 새 본문 `opacity 0→1 + translateY 6px→0`(`--dur-base`). **스크롤 위치는 문단 인덱스 기준으로 최대한 유지**(같은 문단을 보고 있게) — 불가하면 본문 상단으로.
- 레벨은 즉시 클라이언트 캐시(3레벨을 미리 로드해 전환 지연 0에 가깝게). 로딩이 필요하면 본문 자리에 스켈레톤 2~3줄.
- `prefers-reduced-motion: reduce`면 이동/페이드 없이 즉시 교체.

### 3-2. 단어 클릭 동작
- Tap/click: 해당 단어 배경 하이라이트(`--color-accent-soft`) → Smart Dictionary 열림(모바일 sheet / 데스크톱 popover).
- 조회 이력: 조회한 단어는 이후 옅은 점선 하단선으로 "본 적 있음" 표시(로그인 시 영구, 비로그인 세션 한정).
- 문장부호·공백은 클릭 대상 아님. 하이픈 단어(well-known)는 한 토큰으로. 대소문자·구두점 제거한 표제어로 사전 조회.
- 접근성: 각 단어는 `role="button" tabindex="0"`, 키보드 Enter/Space로도 조회 가능. 스크린리더는 단어 정상 읽되 "단어, 뜻 보기" 힌트.

### 3-3. 읽음 처리
- 기사가 "읽음"이 되는 조건(하나라도 충족): (a) 본문 스크롤 90% 도달, 또는 (b) 퀴즈 1문항 이상 제출, 또는 (c) 뷰어 체류 30초↑ + 스크롤 50%↑. `[설계 결정]` 완독 KPI(브리프 18장 Reading Completion) 측정과 연결.
- 표시: 홈 카드에 "✓ 읽음" + opacity .7. 로그인 시 서버 저장, 비로그인은 세션.
- 되돌리기: 필요 없음(MVP). 오늘 지나면 초기화(매일 새 Top 10).

### 3-4. 로딩 / 빈 상태 + 글자크기 조절
- **로딩(홈)**: 카드 스켈레톤 5개(shimmer, `--color-surface-alt` 베이스). 인사말은 즉시(로컬 시간).
- **로딩(뷰어)**: 제목·본문 스켈레톤 라인. 레벨 스위처는 즉시.
- **빈 상태 — 오늘 뉴스 아직 없음**(발행 전 새벽): 일러스트/이모지 ☕ + "오늘의 브리핑을 준비하고 있어요. 보통 아침 8시경 도착해요." + (로그인 시) "어제 브리핑 보기" 링크.
- **빈 상태 — 저장 없음**: "아직 저장한 단어가 없어요. 기사에서 단어를 눌러 저장해보세요."
- **에러**: "브리핑을 불러오지 못했어요. [다시 시도]" — 막혔으면 솔직하게(둘러대지 않음).
- **글자크기 조절(Aa)**: 뷰어 상단 Aa → 팝오버에 S/M/L/XL 4단(`--reading-scale` 0.875/1/1.125/1.25). 본문에만 적용, 선택은 로컬 저장(로그인 시 서버). 학습 앱 필수 기능.
- **인사말 시간대**: 05–11시 "Good Morning", 12–17시 "Good Afternoon", 18–04시 "Good Evening". 사용자 로컬 타임존.

---

## 4. 접근성 · 반응형

### 4-1. 접근성
- **색만으로 정보 전달 금지**: 레벨은 항상 텍스트(A2/B1/B2) 병기. 정답/오답은 아이콘+텍스트 병기. 카테고리는 이모지+라벨.
- **대비**: 본문/배경 AA(4.5:1)↑, 큰 글자 3:1↑. 배지 조합도 4.5:1 목표(위 팔레트 설계 기준).
- **터치 타깃** 최소 44×44px. 인접 탭 간격 8px↑.
- **포커스 가시화**: 모든 인터랙티브 요소 `--color-focus-ring` 2px outline + offset. 키보드 탭 순서 = 시각 순서.
- **본문 글자크기**: 사용자 조절(S~XL) + 브라우저 확대(최대 200%)에서 레이아웃 깨지지 않게 상대 단위.
- **모션 축소**: `prefers-reduced-motion: reduce` 시 슬라이드/페이드 제거, 즉시 전환.
- **스크린리더**: 랜드마크(`header/main/nav`), 기사=`article`, 레벨 스위처=`role="tablist"`, 사전 팝업=`role="dialog" aria-modal`, 포커스 트랩 + Esc 닫기 + 닫을 때 트리거 단어로 포커스 복귀.
- **언어 속성**: 영어 본문 요소에 `lang="en"`, 한국어 UI에 `lang="ko"` — 스크린리더 발음·학습 정확도.

### 4-2. 반응형 브레이크포인트
| 이름 | 폭 | 레이아웃 |
|---|---|---|
| Mobile | < 640px | 1열, 하단 탭바, 세이프패딩 16, sheet형 사전 |
| Tablet | 640–1023px | 1열 중앙(본문 640~680), 하단 탭바 유지 or 상단탭 |
| Desktop | ≥ 1024px | 좌측 사이드 네비 240 + 본문 680 중앙, popover 사전, 카드 hover |
| Wide | ≥ 1280px | `--page-max 1120` 중앙, 여백 확대 |

- **모바일 우선 CSS**(min-width 미디어쿼리 확장). 본문폭은 어느 화면에서도 `--content-max(680)` 초과 금지(가독성 = 한 줄 45~75자).
- 이미지 `max-width:100%`. 가로 스크롤 유발 요소(긴 표·코드)는 자체 `overflow-x:auto` 컨테이너로, 페이지 body는 가로 스크롤 없음.

---

## 5. 컴포넌트 인벤토리 (구현 체크리스트)

MVP 구현에 필요한 컴포넌트 목록. 각각 위 스펙 참조.

1. `AppHeader` (로고/테마토글/설정) — 모바일·데스크톱 변형
2. `SideNav`(데스크톱) / `TabBar`(모바일) — Home/Saved/Settings
3. `GreetingBlock` (시간대 인사 + 날짜 + 브리프 요약)
4. `CategorySummaryChips` (가로 스크롤)
5. `ArticleCard` (카테고리/레벨배지/읽기시간/제목/프리뷰/읽음)
6. `LevelBadge` (A2/B1/B2/Original)
7. `CategoryTag` (도트+이모지+라벨)
8. `ReadTimeMeta`
9. `LevelSwitcher` (세그먼트, sticky, tablist)
10. `ArticleBody` (클릭 단어 렌더 + reading-scale)
11. `ClickableWord`
12. `WordListSection` (접이식)
13. `QuizSection` (객관식 + 채점)
14. `SourcesSection` (복수 링크 + 고지)
15. `SmartDictionary` — `BottomSheet`(모바일) / `Popover`(데스크톱) 변형
16. `FontSizePopover` (Aa, S/M/L/XL)
17. `ThemeToggle`
18. `Onboarding` — `SignupStep` / `LevelPickStep` / `DoneStep` / `ProgressDots`
19. `Skeleton`(카드/본문 라인)
20. `EmptyState`(뉴스없음/저장없음/에러)
21. `SoftLoginBanner` (비로그인 유도)
22. `Button`(Primary/Secondary/Ghost) · `Badge` · `Segmented` — 프리미티브

---

## 6. 메인 에이전트가 결정해야 할 사항 (구현 전)

아래는 이 설계에서 `[설계 결정]`으로 채웠으나 승인·확정이 필요한 항목이다. (CLAUDE.md 규칙 2·9 준수 — 추측으로 진행하지 않고 명시.)

1. **브랜드 강조색**: 로스티드 오렌지 `#C8622D` 채택 여부. (무드에 맞춰 정했으나 브랜딩 팀 최종 컬러가 따로 있으면 교체.)
2. **영어 본문 서체**: Lora(세리프) 방향 승인 여부. 세리프 vs 산세리프는 "리추얼감 vs 현대감" 취향 문제 — 대안 제시 가능.
3. **비로그인 정책(2-5)**: "비로그인도 Top 10 전부 열람" 채택 여부. + MVP에서 Free "3개 제한"을 적용할지(권장: MVP는 무제한).
4. **발음(🔊) 기능**: TTS는 project-brief상 MVP 후속(쉐도잉). Smart Dictionary의 발음 버튼을 MVP에 **넣을지/숨길지**. (IPA 표기만 하고 재생은 후속 권장.)
5. **읽기시간 wpm 기준**: A2/B1/B2 분당 읽기속도(초안 90/120/150). 학습자 실제 속도로 조정 필요.
6. **온보딩 관심사 선택**: MVP에서 제외(project-brief 16장)했으나, 넣을지 여부(Step 2.5).
7. **Original 레벨**: MVP 레벨 스위처에 Original 칸을 노출할지(브리프는 A2/B1/B2/Original 언급, MVP 범위는 A2/B1/B2). 권장: MVP는 3칸만.
8. **하단 탭 구성**: MVP를 Home/Saved/Settings 3탭으로 잡음. Review/AI Tutor 등은 V1.5+. 승인 여부.

---

## 부록: 근거 트레이스

- 무드·핵심화면 구성: project-brief 6장(User Journey), 8장(Core Experience), 20장(Design Principles).
- MVP 범위(5화면): project-brief 16장.
- 레벨 A2/B1/B2 + 분량(150/310/520): project-brief 5장.
- 출처 하단 복수 표기 = 표준: r2-similar-services 7장 "배울 점" 1·8 (Breaking News English 선례).
- CEFR 전면 표기가 차별점: r2 7장 배울 점 2.
- 뉴스 무료 + 부가 수익화 = 비로그인 열람 정책 근거: r2 7장 배울 점 4, 피해야 할 점(페이월 성공 사례 부재).
- 3레벨이 매일 발행과 양립: r2 7장 피해야 할 점 6.
- 저작권(원문 제목·사진 미사용, 재작성, 지어내지 않기): project-brief 14장 + CLAUDE.md 규칙 1.
