# R1 — 뉴스 소스 리서치 (BRIEFLY)

- 작성일: 2026-07-10
- 리서처: Claude (뉴스 소스 리서치 에이전트)
- 목적: 매일 주요 뉴스 10건을 여러 소스 교차 확인 → 사실만 추출 → 새 기사(A2/B1/B2)로 재작성하기 위한 소스 조합 조사.
- 저작권 원칙: 특정 기사 원문 복제 금지, 다중 소스 교차 확인 후 사실만 추출, 출처 표기, 이미지·제목 그대로 사용 금지.

## 표기 규칙
- `[관찰]` = WebFetch/WebSearch로 직접 확인한 결과
- `[문서]` = 공식/2차 문서·검색 결과에 근거 (직접 피드를 열어보진 못함)
- `[추측]` = 맥락상 추론 (검증 안 됨)

---

## 핵심 통찰 (BRIEFLY 모델과의 정합성)

BRIEFLY는 "단일 기사 전문(full text)"이 필요하지 않다. 오히려 **여러 소스의 헤드라인+요약(snippet)을 교차로 모아 사실을 추출**하는 것이 핵심이다.
→ 대부분의 무료 뉴스 API/RSS가 "전문 미제공, 요약만 제공"인데, 이는 BRIEFLY에겐 **약점이 아니라 오히려 저작권상 안전**하다. (원문 전체를 복제·저장하지 않게 됨)
→ 따라서 전략의 중심은 "전문 제공 API"가 아니라 **무료 RSS + Google News RSS(다출처 집계) + GDELT(교차검증용 메타데이터)** 조합이 맞다. `[추측]`이지만 근거는 아래 각 항목.

---

## 1. 주요 영문 매체 RSS (World / 일반)

### BBC News — 사용 가능 `[관찰]`
- URL: `https://feeds.bbci.co.uk/news/world/rss.xml` (World). 다른 카테고리도 동일 패턴.
- 확인: 2026-07-10. 유효한 RSS 2.0, 28건, 최신 2026-07-10 02:30 GMT. 제목/요약 제공.
- 커버리지: World, Business, Technology, Sci/Health, Entertainment 등 카테고리별 피드 존재 `[문서]`.
- 이용약관 리스크: BBC RSS는 개인용(personal, non-commercial) 전제. 상업 서비스에서 **피드를 재배포(그대로 노출)하면 문제**. BRIEFLY처럼 "읽고 사실 추출 후 새로 씀"은 상대적으로 안전하나, 최종적으로 BBC 약관 확인 필요 `[추측]`.

### The Guardian — RSS는 봇 차단, 대신 Open Platform API 권장 `[관찰]`/`[문서]`
- RSS URL: `https://www.theguardian.com/world/rss` — WebFetch 차단됨(봇 보호로 추정) `[관찰]`. 실제 서버 요청은 될 가능성 높음 `[추측]`.
- **더 나은 경로 = Guardian Open Platform API** `[문서]`:
  - 무료 키: 500 calls/day, 카드결제 불필요.
  - **전문(full article body text) 제공** — 무료 뉴스 API 중 드물게 본문까지 줌.
  - 상업적 사용: 비영리는 무료. **수익 내는 앱/웹은 commercial 키 필요(별도 협의)**. → BRIEFLY가 유료화되면 여기 걸림.
  - 문서: https://open-platform.theguardian.com/documentation/
  - 확인: 2026-07-10 (검색 기반). 직접 키 발급·호출은 안 해봄 `[문서]`.

### NPR — 사용 가능 `[관찰]`
- URL: `https://feeds.npr.org/1001/rss.xml` (News). 숫자 ID로 섹션 구분.
- 확인: 2026-07-10. 유효 RSS 2.0, 10건, 최신 2026-07-09 21:03 ET.
- 참고: 미국 국내 이슈 비중 높음. World 보조용.

### Al Jazeera — 사용 가능 `[관찰]`
- URL: `https://www.aljazeera.com/xml/rss/all.xml` (All).
- 확인: 2026-07-10. 유효 RSS 2.0, 25건, 최신 2026-07-10 01:42 UTC.
- 강점: 중동·글로벌사우스 관점. 서구 매체와 **다른 각도** → 교차검증 가치 큼.

### AP (Associated Press) — 공식 RSS 없음 `[문서]`
- AP는 공식 공개 RSS를 제공하지 않음(과거 중단). 시중의 "AP RSS"는 rss.app/feedspot 등 **제3자 재생성 피드**로, 안정성·약관 리스크 있음 `[문서]`.
- 권장: 직접 피드 대신 **Google News RSS에서 source=AP로 필터**하거나, 라이선스 필요 시 AP 공식 상업 계약. 무료로 AP 전문 접근은 어려움 `[추측]`.

### Reuters — 공식 RSS 2020년 중단 `[문서]`
- Reuters는 2020년 6월 공식 RSS 종료 `[문서]`. 현재 공개 RSS 없음.
- 권장: Google News RSS 경유로 Reuters 기사 헤드라인 포착. 전문·재배포는 Reuters Connect(유료 라이선스) 영역 `[문서]`.

---

## 2. 한국 영문 매체 RSS (Korea 카테고리)

### 연합뉴스 영문판(Yonhap English) — RSS 존재하나 직접확인 실패 `[문서]`
- URL(문서 기준): `https://en.yna.co.kr/RSS/news.xml`
- WebFetch 차단됨 `[관찰]`. 검색상 유효 피드로 언급됨 `[문서]`. 실제 동작은 서버측 요청으로 재확인 필요.
- 가치: 한국발 뉴스의 1차·준공식 소스. Korea 카테고리 핵심 후보.
- 리스크: 연합뉴스는 저작권에 엄격(뉴스통신사). 재배포 금지, "사실 추출 후 재작성" 원칙 반드시 준수 `[추측]`.

### Korea Herald — 사용 가능(카테고리별 피드 다수) `[관찰]`
- RSS 안내 페이지: `https://www.koreaherald.com/rss`
- 카테고리별 피드 `[관찰]` (도메인 `https://www.koreaherald.com` + 아래 경로):
  - 전체: `/rss/newsAll`
  - National: `/rss/kh_National`
  - Business: `/rss/kh_Business`
  - Life & Culture: `/rss/kh_LifenCulture`
  - Sports: `/rss/kh_Sports`
  - World: `/rss/kh_World`
  - Opinion: `/rss/kh_Opinion`
  - K-pop: `/rss/kh_Kpop`
- 확인: 2026-07-10. `/rss/newsAll` 유효 RSS 2.0, 50건, 최신 2026-07-10 11:25 KST. **요약(truncated)만 제공, 전문 아님.**
- 강점: 카테고리 분리가 잘 되어 있어 BRIEFLY의 Korea·Culture·Sports 매핑에 유리.

### Korea JoongAng Daily — 피드 URL 있으나 직접확인 실패 `[문서]`
- URL(문서 기준): `https://koreajoongangdaily.joins.com/xmls/joins`
- WebFetch 차단됨 `[관찰]`. 검색상 존재로 언급되나 홈페이지에 노출/자동탐지 안 됨 `[문서]`. 재확인 필요.
- 참고: NYT 제휴 영문지. Korea 카테고리 교차검증용 2번째 소스로 유용.

### 기타 후보 `[문서]`
- Korea Times: `https://www.koreatimes.co.kr/www2/common/rss.asp` (RSS 안내 페이지) — 미확인.
- Korea.net(정부 공식): `https://www.korea.net` RSS 제공 — **정부 발표/저작권 부담 낮음**, Korea 카테고리 보조에 좋음 `[문서]`.

---

## 3. 공개/무료 집계 데이터

### Google News RSS — 강력 추천(다출처 집계) `[관찰]`
- 검색형 URL: `https://news.google.com/rss/search?q=<쿼리>&hl=en-US&gl=US&ceid=US:en`
- 확인: 2026-07-10. `q=Korea`로 유효 RSS, 100건, 최신 2026-07-10 02:37 GMT.
- 각 item: 제목 / 링크(구글 리다이렉트) / GUID / 발행일 / **source(매체명)** / description(요약 스니펫) `[관찰]`.
- 강점:
  - 하나의 사건에 대해 **AP·Reuters·Bloomberg 등 여러 매체 헤드라인을 한 번에** 확보 → 교차검증의 핵심 인프라.
  - 토픽/쿼리별 피드 자유 구성(카테고리 매핑 쉬움).
  - 무료·키 불필요.
- 리스크/한계:
  - 링크가 구글 리다이렉트라 원문 직접 파싱은 한 단계 더 필요.
  - 제공되는 건 **헤드라인+짧은 요약뿐**(전문 아님) — BRIEFLY 모델엔 오히려 적합.
  - Google 약관상 "스크래핑" 성격 논쟁 여지 `[추측]`. 개인/소규모는 통상 문제없이 쓰이나, 대규모 상업 이용 시 검토 필요.

### GDELT Project — 교차검증·트렌드용 메타데이터, 진짜 무료 `[문서]`
- 사이트: `https://www.gdeltproject.org/` , DOC 2.0 API, BigQuery, 파일 다운로드.
- 특징 `[문서]`:
  - 전 세계 방송·인쇄·웹 뉴스를 100여 개 언어로 **15분마다** 갱신. 무제한 무료.
  - 제공: events(누가 누구에게 무엇을), mentions(각 사건을 언급한 기사 목록+tone), GKG(테마·인물·장소·조직·감정 태그).
  - **본문(full text) 미제공** — 기사 링크·메타데이터·톤만. → "어떤 사건이 여러 매체에서 얼마나 다뤄지는지"를 판단하는 **교차검증/중요도 랭킹** 용도에 최적.
- 리스크: 라이선스 저널리즘(전문)은 없음. 데이터 엔지니어링 필요(연구용 데이터셋 성격). 상업 이용 세부 약관은 재확인 필요 `[문서]`.

---

## 4. 뉴스 API 서비스 (유료 티어 비교)

> 공통 패턴 `[문서]`: **무료 티어는 대부분 (a) 전문 미제공(요약만) (b) 지연(12~24h/30min) (c) 상업 사용 금지 또는 제한.** 실서비스로 가면 유료 필요. 단, BRIEFLY는 전문이 필요 없으므로 "요약만"은 문제 아님. 걸리는 건 **상업 사용 조항**.

| 서비스 | 무료 티어 | 전문 제공 | 상업 사용(무료) | 유료 시작가 | 지연 | 확인근거 |
|---|---|---|---|---|---|---|
| **NewsAPI.org** | 100 req/day, 1개월 이내 기사만 | ❌ 전문 없음(URL만) | ❌ 개발/테스트 전용, 프로덕션 금지 | Business $449/mo | 24h | `[문서]` 2026-07-10 |
| **NewsData.io** | 200 credit/day(≈2,000건) | ❌ 무료는 전문 없음 | ⭕ **무료도 상업 사용 허용(드묾)** | Basic $199.99/mo | 12h | `[문서]` 2026-07-10 |
| **GNews** | 100 req/day(≈1,000건) | ❌ 무료는 content 잘림(expand=content는 유료) | 제한적(무료는 dev-only 아님) | Essential €49.99/mo | 12h | `[문서]` 2026-07-10 |
| **Mediastack** | 100~500 req/**월**(매우 적음) | ❌ 전문 없음 | ❌ 무료 상업 금지, 출처표기 필수 | 유료 $24.99/mo (또는 $11/mo 티어) | 30min | `[문서]` 2026-07-10 |
| **Guardian Open Platform** | 500 calls/day | ⭕ **전문 제공** | ❌ 비영리만 무료, 수익화 시 commercial 키 | 협의 | 낮음 | `[문서]` 2026-07-10 |

정리:
- **전문까지 무료로 주는 곳은 Guardian뿐**(단일 매체·상업 제한).
- **무료 티어에서 상업 사용이 명시 허용되는 곳은 NewsData.io가 거의 유일** → BRIEFLY 상업화 시 유력.
- 나머지(NewsAPI/Mediastack)는 무료 상업 사용 금지 → 실서비스엔 유료 전제.

---

## 5. 보도자료·정부 발표 등 1차 소스 (저작권 부담 낮음)

- **Korea.net (대한민국 공식)** `[문서]`: 정부 발표·정책 뉴스 영문. Korea 카테고리 보조. RSS 제공.
- **정부/공공기관 보도자료**: 대체로 자유 이용·인용 관대(각 기관 정책 확인). 정치/정책 이슈 사실 확인의 1차 소스로 유용 `[추측]`.
- **기업 IR/보도자료**: Business·Finance, AI·Tech 카테고리에서 기업 발표(실적·제품)를 1차로 확인 가능. 상장사 IR 페이지·PR Newswire/Business Wire 등 `[추측]`.
- 장점: 사실·수치의 **원천(primary)**이라 교차검증의 기준점이 됨. 이미지·문구는 여전히 그대로 쓰지 않도록 주의.
- 한계: 보도자료는 발신자 관점(홍보성)이므로, 반드시 중립 매체와 교차 필요 `[추측]`.

---

## 카테고리 × 소스 매핑 (요약)

| 카테고리 | 1차(주력) | 교차검증(2·3차) | 비고 |
|---|---|---|---|
| World | BBC World RSS `[관찰]` | Al Jazeera `[관찰]`, Google News RSS(다출처), NPR | AJ로 서구편향 보정 |
| Korea | 연합영문 `[문서]` / Korea Herald `[관찰]` | Korea JoongAng Daily `[문서]`, Korea.net, Google News(q=Korea) | 연합은 재작성 원칙 엄수 |
| AI·Tech | Google News RSS(주제쿼리) | BBC Tech, GDELT 테마, 기업 보도자료 | 전문 매체 RSS 추가 검토 필요 |
| Business·Finance | Google News RSS | BBC Business, Korea Herald Business, 기업 IR | 유료 API는 후순위 |
| Culture·Sports | Korea Herald Culture/Sports/Kpop `[관찰]` | BBC, Al Jazeera, Google News | K-pop 피드 별도 존재 |

---

## 미확인·후속 과제 (정직 표기)
- Guardian RSS / 연합영문 RSS / JoongAng Daily RSS: WebFetch 차단으로 **직접 열어보지 못함**. 서버측 HTTP 요청으로 재확인 필요.
- Guardian API·NewsData.io: 실제 키 발급·호출 테스트 안 함(검색 근거만).
- 각 매체 RSS의 상업 이용 약관 원문은 개별 정독 필요(특히 BBC, 연합, Reuters/AP 라이선스).
- AI·Tech 전문 매체(예: 특정 테크 매체) 공개 RSS는 이번 조사 범위에서 개별 확인 못 함 — 후속 필요.

---

## 부록: 메인 에이전트 서버측 재검증 (2026-07-10, curl 직접 확인)

R1이 봇 차단으로 확인 못 한 피드를 메인 에이전트가 직접 검증한 결과:

| 피드 | 결과 |
|---|---|
| Guardian World RSS (`theguardian.com/world/rss`) | ✅ HTTP 200, 정상 RSS (156KB) |
| 연합뉴스 영문 RSS (`en.yna.co.kr/RSS/news.xml`) | ✅ HTTP 200, 정상 RSS (65KB) |
| Korea JoongAng Daily (`koreajoongangdaily.joins.com/xmls/joins`) | ❌ HTTP 404 — 해당 URL 폐기. 다른 경로 존재 여부 추후 확인 |
| 매일경제 RSS (`mk.co.kr/rss/30800011/`) | ✅ HTTP 200, 정상 RSS (한국어 — 참고용) |

→ 결론: 서버측 요청 기준으로 Guardian·연합영문 피드 사용 가능. Korea 카테고리는 Korea Herald + 연합영문 조합으로 충분히 커버 가능.

## 부록 2: AI·Tech 소스 및 Google News 주제 쿼리 검증 (2026-07-10, 메인 에이전트 curl 확인)

| 피드 | 결과 |
|---|---|
| TechCrunch (`techcrunch.com/feed/`) | ✅ HTTP 200, 정상 RSS |
| The Verge (`theverge.com/rss/index.xml`) | ✅ HTTP 200, 정상 Atom |
| Ars Technica (`arstechnica.com/feed/`) | ✅ HTTP 200, 정상 RSS |
| Google News RSS 주제 쿼리 (`news.google.com/rss/search?q=...`) | ✅ HTTP 200, 정상 작동 (138KB) |
| Korea JoongAng Daily (`/rss`) | ❌ 404 — RSS 미제공으로 판단, 제외. Korea는 Korea Herald + 연합영문으로 커버 |

→ R1이 남긴 후속 과제(AI·Tech 전용 매체 RSS 확인) 완료. AI·Tech 카테고리는 TechCrunch + The Verge + Ars Technica + Google News 주제 쿼리로 확정 가능.
