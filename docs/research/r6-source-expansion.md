# R6 — 소스 확장 검증 (Business 보강 + 지역 다변화 + Google News 지역판)

- 작성일: 2026-07-13
- 배경: top10-curation.md §2 (World 미국 정치 편중 진단 → Business 소스 부족, Google News gl=US 단일판 원인 지목)
- 원칙: news-sourcing-strategy.md §1 — RSS/공개 API만, 로그인·페이월 우회 절대 금지
- 검증 방식: curl(HTTP 코드 + 실제 RSS 아이템 유무, User-Agent 지정) + WebFetch/curl(이용약관·robots.txt 재사용 조항 확인)

## 표기 규칙
- `[관찰]` = curl/WebFetch로 직접 확인
- `[문서]` = 검색/2차 자료 근거
- `[추측]` = 맥락 추론(미검증)

---

## 1. Business 보강 후보

| 후보 | URL | HTTP | RSS 아이템 | 약관 메모 | 채택 |
|---|---|---|---|---|---|
| BBC Business | `https://feeds.bbci.co.uk/news/business/rss.xml` | 200 `[관찰]` | 49건, 정상 RSS 2.0 `[관찰]` | BBC 계열(기존 World와 동일 outletKey `bbc`) — 기존 채택 원칙과 동일 리스크 수준 | ✅ 채택 |
| CNBC (Top News) | `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114` | 200 `[관찰]` | 30건, 정상 RSS 2.0 `[관찰]` | NBCUniversal 약관: "사전 서면 동의 없이 콘텐츠 이용 금지" 일반 조항 `[관찰]` — Guardian·Al Jazeera 기존 채택 소스와 동일 수준(RSS+non-commercial+prior written 조합)의 표준 저작권 문구. RSS 배포 자체를 금지하는 특별 조항 아님 | ✅ 채택 (독립 매체 1) |
| MarketWatch (Dow Jones) | `https://feeds.content.dowjones.io/public/rss/mw_topstories` | 200 `[관찰]` | 10건, 정상 RSS 2.0 `[관찰]` | 약관 페이지 WebFetch 차단(403). robots.txt는 RSS 경로 미차단 `[관찰]`. Dow Jones 공식 RSS 배포 인프라(feeds.content.dowjones.io)로 RSS 자체가 공식 배포 채널 `[문서]` | ✅ 채택 (독립 매체 2) |
| Investing.com | `https://www.investing.com/rss/news.rss` | 200 `[관찰]` | 10건, 정상 RSS `[관찰]` | 약관에 **"It is prohibited to use, store, reproduce, display, modify, transmit or distribute the data contained in this website without the explicit prior written permission of Fusion Media and/or the data provider"** 명시 `[관찰]`. 시세 데이터 provider 조항이 주 목적으로 보이나 문구가 사이트 전체 데이터를 포괄해 다른 채택 소스보다 뚜렷하게 강한 금지 표현 | ❌ 제외 — 약관 문구가 다른 소스 대비 유의하게 강한 재사용 금지. 보수적 판단 |

**결론: BBC Business + CNBC + MarketWatch로 Business 카테고리 독립 매체 3개 확보 (게이트 목표인 2개 이상 달성).**

---

## 2. 지역 다변화 후보

| 후보 | URL | HTTP | RSS 아이템 | 약관 메모 | 채택 |
|---|---|---|---|---|---|
| DW (독일) | `https://rss.dw.com/xml/rss-en-all` | 200 `[관찰]` | 139건, 정상 RSS 2.0 `[관찰]` | 공영방송, RSS 공식 배포(자체 안내 페이지 존재) `[문서]`. robots.txt RSS 미차단 `[관찰]` | ✅ 채택 (World, country=DE) |
| France24 | `https://www.france24.com/en/rss` | 200 `[관찰]` | 24건, 정상 RSS 2.0 `[관찰]` | 프랑스 국영 국제방송. 약관 WebFetch 403이나 robots.txt RSS 미차단 `[관찰]`, RSS 공식 제공 페이지 존재 `[문서]` | ✅ 채택 (World, country=FR) |
| Nikkei Asia | `https://asia.nikkei.com/rss/feed/nar` | 200 `[관찰]` | RSS 1.0(RDF) 형식. curl로는 `<item>` 태그가 아닌 RDF 시퀀스(`<rdf:li>`)라 카운트가 어긋나 보였으나, 파이프라인이 실제 쓰는 `rss-parser`(collect.ts)로 직접 파싱 테스트한 결과 50개 아이템 정상 추출 확인 `[관찰]` | 일본 매체 아시아 경제 전문. robots.txt RSS 미차단 | ✅ 채택 (Business, country=JP) — 파이프라인 파서 호환성 검증 완료 |
| The Straits Times | `https://www.straitstimes.com/news/world/rss.xml` | 200 `[관찰]` | 50건, 정상 RSS 2.0 `[관찰]` | 싱가포르 대표 영문지. robots.txt RSS 미차단 | ✅ 채택 (World, country=SG) |
| SCMP | `https://www.scmp.com/rss/91/feed` | 200 `[관찰]` | 50건, 정상 RSS 2.0 `[관찰]` | 홍콩 기반, 중화권 관점. robots.txt RSS 미차단 | ✅ 채택 (World, country=HK) |
| ABC Australia | `https://www.abc.net.au/news/feed/51120/rss.xml` | 200 `[관찰]` | 25건, 정상 RSS 2.0 `[관찰]` | 호주 공영방송. robots.txt RSS 미차단 | ✅ 채택 (World, country=AU) |
| CBC (캐나다) | `https://www.cbc.ca/cmlink/rss-topstories` | **연결 실패** `[관찰]` | HTTP:000 — HTTP/2 스트림 오류(`INTERNAL_ERROR`), `--http1.1` 강제해도 재현 동일 실패 | 서버 접속 자체 불가로 약관 확인 이전 단계에서 탈락 | ❌ 제외 — curl 접속 실패. 추후 재검증 필요(봇 차단 가능성) |
| The Diplomat (아시아·태평양 외교 전문) | `https://thediplomat.com/feed/` | 200 `[관찰]` | 96건, 정상 RSS `[관찰]` | 이번 임무 범위(Business/지역다변화 게이트) 밖 성격이라 이번엔 미채택 — 후속 후보로 기록만 | ⏸ 보류(미채택) — 정치 전문지라 카테고리 적합성 재검토 필요 |

---

## 3. Google News 지역판 + 신규 쿼리

기존 4쿼리(Business/Korea/World/AI, 전부 `gl=US`)에 `gl=GB` 변형과 신규 주제 쿼리(Asia/Europe/economy/global markets)를 검증.

| 쿼리 | URL | HTTP | 결과 |
|---|---|---|---|
| Business (GB) | `q=business&hl=en-GB&gl=GB&ceid=GB:en` | 200 `[관찰]` | 100건 정상 |
| Korea (GB) | `q=Korea&hl=en-GB&gl=GB&ceid=GB:en` | 200 `[관찰]` | 100건 정상 |
| World (GB) | `q=world%20news&hl=en-GB&gl=GB&ceid=GB:en` | 200 `[관찰]` | 100건 정상 |
| AI (GB) | `q=artificial%20intelligence&hl=en-GB&gl=GB&ceid=GB:en` | 200 `[관찰]` | 100건 정상 |
| Asia (신규, GB) | `q=Asia&hl=en-GB&gl=GB&ceid=GB:en` | 200 `[관찰]` | 100건 정상 |
| Europe (신규, GB) | `q=Europe&hl=en-GB&gl=GB&ceid=GB:en` | 200 `[관찰]` | 100건 정상 |
| Economy (신규, US) | `q=economy&hl=en-US&gl=US&ceid=US:en` | 200 `[관찰]` | 100건 정상 |
| Global Markets (신규, US) | `q=global%20markets&hl=en-US&gl=US&ceid=US:en` | 200 `[관찰]` | 100건 정상 |

전부 정상 작동. 약관 리스크는 기존 4개 Google News 쿼리와 동일(이미 화이트리스트에 있던 소스의 변형이므로 R1에서 검토 완료된 리스크 수준 유지).

**적용**: World 슬롯 지역 편중 완화를 위해 World/Korea/AI에 GB판 1개씩 추가, Business에 GB판 1개 + 신규 쿼리(economy, global markets) 추가, World에 Asia/Europe 신규 쿼리 추가. Google News 쿼리는 전부 `outletKey: "google-news"`로 묶어 2소스 게이트에서 1소스로만 카운트되도록 함(중복 판정 강화, top10-curation.md §1).

---

## 4. 최종 반영 요약

- `pipeline/src/types.ts`의 `SourceConfig`에 `country`(ISO 3166-1 alpha-2), `outletKey`(동일 매체 dedup 키) 필드 추가. 기존 15개 소스에도 소급 적용.
- `pipeline/src/config/sources.ts`: 15개 → 26개 소스로 확장.
  - Business: 1개(Google News만) → BBC Business·CNBC·MarketWatch(독립 매체 3) + Google News 3개(US/GB/economy/markets 등)로 확장.
  - World: BBC/Guardian/AJ/NPR(전부 GB/QA/US) → DW(DE)·France24(FR)·ABC Australia(AU)·Straits Times(SG)·SCMP(HK) 추가로 6개국 대표.
  - Google News: gl=US 단일 4쿼리 → gl=GB 변형 4개 + 신규 주제 쿼리(Asia/Europe/economy/global markets) 추가.
- 제외: Investing.com(약관 재사용 금지 명시), CBC(접속 실패), The Diplomat(카테고리 적합성 미확정 — 보류).
- typecheck·기존 48개 테스트 전부 통과 확인. 선정 로직(selectTop10 등)은 수정하지 않음 — 다음 팀 작업.
