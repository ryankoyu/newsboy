# PROJECT BRIEF

## BRIEFLY (가칭)

**AI-powered Daily News Learning Platform**

> **영어 때문에 최신 정보를 놓치는 성인들에게, AI가 영어 수준에 맞게 재구성한 오늘의 뉴스를 제공하여 매일 세상을 이해하면서 자연스럽게 영어를 습득하도록 만든다.**

Version 0.1 — 2026-07-10

---

> **이 문서 읽는 법**
> 이 문서는 2026-07-10 GPT 대화에서 합의된 내용을 기준 문서로 정리한 것이다.
> - 표시 없는 내용 = GPT 대화에서 **합의된 내용**
> - 💡 **제안** = 대화에 없어서 Claude가 채운 것. 확정 전 검토 필요.

---

## 1. Executive Summary

**한 줄 정의**

> BRIEFLY는 매일 가장 중요한 뉴스를 사용자의 언어 수준에 맞게 재구성하여, 세상을 이해하는 가장 쉬운 방법을 제공하는 AI 기반 데일리 브리핑 플랫폼이다.

**Mission**

> Understand today's world while improving your English.

**슬로건 후보**

- Today's News. Your English.
- Read Today. Speak Tomorrow.

**포지셔닝** — 영어 앱도, 뉴스 앱도 아니다.

> "매일 15분, 세상을 따라가면서 영어까지 배우는 앱."

**핵심 철학 (Product Principle #1)**

> People don't come to learn English.
> They come to understand today's world.
> English is simply the language that gets them there.

---

## 2. Background — 왜 이 서비스를 만드는가

**성인 학습자의 Pain Point**

- 성인은 아이들용 콘텐츠("Three cats are playing in the park.")를 읽고 싶지 않다. OpenAI의 새 모델, 미국 금리, 삼성의 발표가 궁금하다.
- 실제 뉴스(Reuters, Bloomberg, 연합뉴스)는 영어가 어려워 읽을 수 없다.
- 영어 학습용 뉴스(News in Levels, VOA 등)는 존재하지만 — 뉴스가 오래됐고, 실시간성이 없고, 콘텐츠가 적고, 한국 사용자를 위한 것이 아니다.
- 한국에는 "한국 성인을 위한 A2~B2 시사 영어 읽기" 서비스가 사실상 없다.

**핵심 통찰**

- 사람들은 영어를 못하는 게 아니라, 너무 어려운 영어를 읽으라고 해서 포기한다.
- "영어 공부해야지"라는 동기는 매일 생기지 않지만, **"오늘 무슨 일이 있었지?"라는 동기는 매일 생긴다.**
- 그래서 영어 학습을 위해 뉴스를 쓰는 게 아니라, **뉴스를 보러 들어왔다가 영어를 배우게 만든다.** (Learning by Curiosity)

**왜 지금인가** — AI 덕분에 매일 최신 뉴스를 사용자 수준에 맞게 재작성하는 것이 이제 현실적으로 가능해졌다. 몇 년 전과의 가장 큰 차이.

---

## 3. Service Overview

- **무엇**: 매일 오늘의 주요 뉴스 10개를 AI가 A2/B1/B2 레벨 영어로 재작성해 제공하고, 기사 하나마다 읽기→단어→듣기→말하기→퀴즈→복습이 이어지는 완결된 학습 경험을 만든다.
- **누구를 위해**: 직장인, 취준생, 글로벌 기업 준비생, TOEIC 이후의 성인 학습자 (한국 사용자 우선).
- **무엇을 해결**: "최신 정보를 알고 싶은데 영어가 어렵다" + "영어를 공부하고 싶은데 지속이 안 된다"를 동시에 해결.

---

## 4. Service Structure — 서비스 전체 구조

```
News Sources (Reuters / AP / 연합뉴스 / 정부 발표 / 기업 보도자료)
        │
        ▼
  AI가 사실(Fact)만 추출
        │
        ▼
  기사 내용을 완전히 재작성
        │
        ▼
  A2 → B1 → B2 버전 생성
        │
        ▼
  학습 콘텐츠 자동 생성 (단어·문법·퀴즈·쉐도잉·AI대화)
        │
        ▼
  Today's Top 10 발행
        │
        ▼
  사용자: 레벨 선택 → 학습 → 복습
```

---

## 5. AI Content Pipeline — 뉴스가 만들어지는 과정

```
뉴스 수집 → Fact 추출/검증 → 기사 재작성
  → A2 버전 (약 150~180단어)
  → B1 버전 (약 300~320단어)
  → B2 버전 (약 520단어, 원문에 가까운 표현)
  → Vocabulary (핵심 단어) → Grammar 포인트
  → Quiz → Shadowing(음성 생성) → AI Conversation 질문
  → Publish
```

- 원문은 그대로 싣지 않는다. (저작권 전략 — 14장 참고)
- **기사 선정도 AI가 한다**: ① 전 세계에서 가장 중요한 뉴스 ② 한국인이 관심 가질 뉴스 ③ 영어 학습하기 좋은 뉴스 — 세 기준을 종합해 Top 10 선정.

---

## 6. User Journey — 하루 사용 시나리오

```
08:30 Push 알림
  → 앱 실행: "Good Morning, Ryan. ☀️ Your Daily Brief"
  → Today's Top 10 확인
  → 기사 선택 → 읽기 (내 레벨로)
  → 모르는 단어 클릭 (Smart Dictionary)
  → 쉐도잉 → AI와 영어 대화 → 퀴즈
  → 완료 (기사당 약 5분, 전체 브리핑 약 15분)
  → 오늘 배운 표현 자동 저장
  → 퇴근 후 복습 알림
```

**5분 마이크로 러닝 구성 (기사 1개 기준)**

- ⏱️ 기사 읽기 2분 / 📖 단어 학습 1분 / 🗣️ AI 대화 1분 / 📝 퀴즈·복습 1분

---

## 7. Information Architecture — 앱 구조

```
Home
├── Today's Top 10
├── Categories
├── Search
├── Saved
├── Review
├── AI Tutor
├── My Vocabulary
├── Progress
└── Settings
```

**온보딩**: 회원가입 → 레벨 선택(A2/B1/B2) → 관심사 선택(AI, Business, Sports, Movies, Travel, Startups, History, Psychology 등)

---

## 8. Core Experience

하나의 기사가 하나의 완결된 '학습 경험'이 되어야 한다:

```
Top 10 → 기사 읽기 → Level 전환 비교 → Vocabulary
  → Shadowing → AI Conversation → Quiz → Review
```

홈 화면은 기사 목록이 아니라 **"오늘 아침 브리핑을 받는다"**는 느낌:

```
Good Morning, Ryan.
☀️ Your Daily Brief — 오늘 꼭 알아야 할 뉴스 10개 (약 12분)
🌍 World (2) · 🤖 AI (2) · 💼 Business (2) · 🇰🇷 Korea (2) · 🎭 Culture (1) · ⚽ Sports (1)
Your English Level: A2
```

---

## 9. Core Features — 핵심 기능

| 기능 | 설명 |
|---|---|
| **Today's Top 10** | 매일 AI가 선정한 주요 뉴스 10개. 서비스의 브랜드 자산. |
| **Level Switch** | 버튼 하나로 같은 기사를 A2↔B1↔B2↔Original로 전환. 최대 차별점. |
| **Smart Dictionary** | 단어 클릭 → 뜻·예문·자주 쓰는 표현·발음·유의어. 번역기가 아니라 학습 사전. |
| **Sentence Compare** | 문장 클릭 → 같은 문장이 A2/B1/B2에서 어떻게 달라지는지 비교. |
| **AI Tutor / Conversation** | 기사를 읽고 나면 AI가 영어로 질문 → 사용자가 답 → 문법 교정·자연스러운 표현 제안. |
| **Shadowing** | 문장 클릭 시 원어민 발음 재생, 따라 말하기. |
| **Quiz** | 기사 이해도 확인 퀴즈. |
| **Daily Review** | 오늘 배운 표현 자동 저장 + 퇴근 후 복습 알림. |
| **관심사 기반 큐레이션** | 가입 시 선택한 관심 분야 기사 우선 노출. |
| Bookmark / Progress | 저장, 학습 진행 현황. |

---

## 10. Content Strategy

**왜 Top 10인가** — "오늘 이 10개만 읽으면 세상 돌아가는 흐름은 놓치지 않는다"는 신뢰를 만든다. 뉴스 나열이 아니라 **'오늘 꼭 알아야 할 10가지' 큐레이션**.

**균형 구성 (예시)**

- 🌍 세계를 바꿀 뉴스 3개
- 🇰🇷 한국 관련 뉴스 2개
- 🤖 AI·테크 뉴스 2개
- 💼 비즈니스·경제 뉴스 2개
- 🎭 가볍게 읽을 문화·스포츠 뉴스 1개

**카테고리 풀**: World, Business, AI, Technology, Korea, Finance, Science, Sports, Entertainment, Lifestyle

---

## 11. Learning Strategy — 왜 영어가 늘어나는가

```
Reading → Vocabulary → Listening → Speaking → Review → Retention
```

- 하나의 뉴스로 읽기·듣기·말하기를 모두 끝낸다 (One Brief, One Learning Session).
- A2에서 시작해 같은 기사를 B1, B2로 올라가며 읽는 성장 구조.
- 복습 알림으로 망각 곡선 대응 (배운 표현 자동 저장 → 저녁 복습).

---

## 12. Differentiation — 차별화

| 서비스 | 한계 | BRIEFLY |
|---|---|---|
| News in Levels | 레벨별 제공은 좋으나 최신성·분량 부족, 한국 사용자 대상 아님 | **오늘의** 뉴스, 매일 10개 |
| VOA / BBC Learning | 성인용이지만 실시간성 없음, 학습 흐름 미완결 | 읽기→말하기→복습 완결 |
| Korea JoongAng Daily | B2 이상 원어민 수준, 학습 기능 없음 | A2부터 읽을 수 있음 |
| Duolingo / Cake / Speak / ELSA | 학습 자체가 목적 → 지루해서 이탈 | 뉴스(정보 욕구)가 매일 오게 만듦 |

**본질적 차별점**: 뉴스를 모으는 게 아니라, **AI가 최신 뉴스를 각 사용자 수준에 맞게 즉시 재구성하고 그 자리에서 학습까지 완성해 주는 경험.** '정보 소비 + 영어 학습' 두 욕구를 동시에 해결.

---

## 13. Business Model

대화에서는 큰 틀만 합의됨: **Free / Premium / Enterprise(기업용) / School(학교용) / B2B API**

💡 **제안** (검토 필요): Free = 하루 Top 10 중 3개 + 기본 레벨 / Premium = 전체 기사 + AI Tutor 무제한 + 복습 시스템. 가격·구성은 MVP 검증 후 결정.

---

## 14. Copyright Strategy — 저작권 전략

- **사실(Fact)은 저작권이 없다** — 사실만 추출해 사용.
- **기사 문장·구성은 저작권이 있다** — 전문 복제 금지, 몇 단어만 바꾸는 것도 금지.
- **원칙: 원문 → 이해 → 완전히 새로 작성** (단어·문장 구조를 바꾸고 레벨에 맞게 재구성).
- 원문은 서비스에 싣지 않고, 출처는 표기한다.
- 기사 사진·삽화는 사용하지 않는다. 기사 제목 그대로 사용도 피한다.
- 특정 언론사 기사에만 지속 의존하지 않고 여러 공개 출처로 사실관계를 확인한다.
- 출시 전 저작권 전문 변호사 검토를 받는다.

---

## 15. Technical Overview

**확정 (2026-07-10)**:

- **플랫폼**: 웹 우선. 모바일 대응(반응형) 웹앱으로 만든다. 앱은 나중에.
- **뉴스 수집**: 하나의 기사에 의존하지 않고, **여러 뉴스를 읽고 사실(Fact) 위주로 새 기사를 쓰는 다중 소스 방식** (저작권 전략과 일치). 구체 전략은 [news-sourcing-strategy.md](news-sourcing-strategy.md) 확정 (2026-07-10, Phase 1 리서치 결과).

💡 **제안** (검토 필요):

- **프론트엔드**: Next.js
- **백엔드/DB**: Supabase (인증 + DB + 스토리지 한 번에)
- **AI**: 뉴스 재작성·퀴즈 생성용 LLM API + TTS(음성)

---

## 16. MVP

**확정 (2026-07-10)** — 아래 범위로 MVP를 만든다:

1. 뉴스 수집 + AI 재작성 파이프라인 (하루 10개, 반자동이라도)
2. Today's Top 10 홈 화면
3. 기사 뷰어 + **Level Switch (A2/B1/B2)**
4. Smart Dictionary (단어 클릭 → 뜻/예문)
5. 회원가입 + 레벨 선택

**나중으로 미룰 것**: **퀴즈(2026-07-10 사용자 지시로 MVP 제외)**, AI Conversation, Shadowing(TTS), 복습 알림, 관심사 큐레이션, Progress, 결제

---

## 17. Roadmap

💡 **제안** (대화에서는 V1→V2→V3 틀만 합의):

- **V1 (MVP)**: 웹, Top 10 + 레벨 전환 + 사전. 콘텐츠 파이프라인 검증.
- **V1.5**: 퀴즈, 쉐도잉(TTS), 복습 시스템.
- **V2**: AI Conversation(Tutor), 관심사 큐레이션, 모바일 앱, Premium 결제.
- **V3**: 기업용/B2B, 확장.

---

## 18. KPI — 성공 지표

DAU · Retention · Reading Completion(기사 완독률) · Daily Learning Time · AI Conversation 참여율 · Subscription Rate

---

## 19. Future Vision

영어에서 끝나지 않는다. 본질은 **Daily Intelligence Platform**.

- 언어 확장: 일본어, 중국어, 스페인어
- 버티컬 확장: Business Brief, AI Brief, Startup Brief, Finance Brief
- 시장 확장: Kids, 기업 교육(Company Learning), B2B API

---

## 20. Design Principles — 의사결정 기준

1. **Today's News First** — 모든 콘텐츠는 오늘의 최신 뉴스에서 시작한다.
2. **Learning Without Feeling Like Studying** — 사용자는 공부한다고 느끼지 않아야 한다.
3. **One Brief, One Learning Session** — 하나의 뉴스로 읽기·듣기·말하기를 모두 끝낸다.
4. **Curiosity Drives Learning** — 호기심이 학습을 이끈다.
5. **Every Feature Must Save Time** — 모든 기능은 바쁜 직장인의 시간을 절약해야 한다.

---

## 부록 — 다음 단계

**2026-07-10 확정된 결정**

1. 서비스 이름: 가칭 **BRIEFLY**로 진행, 네이밍은 나중에 다시.
2. 뉴스 수집: 다중 소스에서 사실만 추출해 새로 쓰는 방식. 구체 소스는 리서치 필요.
3. 플랫폼: 웹 우선, 모바일 대응 웹앱.
4. MVP 범위: 16장 확정안대로.

**남은 것**: 뉴스 소스 리서치 → 기술 설계 → MVP 제작 (에이전트 팀 병렬 진행)

**원본 자료**: [gpt-conversation-2026-07-10.md](reference/gpt-conversation-2026-07-10.md)
