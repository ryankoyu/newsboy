# Newsboy 문서 인덱스 (구 가칭 BRIEFLY)

> 처음 읽는 사람은 위에서 아래 순서로.

## 제품이 무엇인가
- [project-brief.md](project-brief.md) — 기준 문서 (비전·구조·기능·MVP 범위)
- [competitive-analysis.md](competitive-analysis.md) — 경쟁 지도와 강점/약점
- [feature-status.md](feature-status.md) — **기능의 단일 기준**: 인벤토리 **102행** + 구현 상태 (2026-08-12 갱신 · ✅62/△18/❌15/🔒7)

## 어떻게 만드는가
- [news-sourcing-strategy.md](news-sourcing-strategy.md) — 뉴스 수집·재작성·출처·저작권 전략
- [design/design-decisions.md](design/design-decisions.md) — **설계 충돌 시 최우선 기준** (결정 이력 §4.x)
- [design/a1-architecture.md](design/a1-architecture.md) · [a2-data-model.md](design/a2-data-model.md) · [a3-ui-ux.md](design/a3-ui-ux.md) — 아키텍처·DB·디자인 시스템
  - ⚠️ **a2(DB 스키마)의 실제 단일 기준은 `supabase/migrations/`다.** a2는 설계 의도의 기록이고, 마이그레이션 0003·0004·0005가 그 위에 얹혀 있다 — 스키마를 확인할 일이 있으면 마이그레이션을 볼 것.
  - ⚠️ **a1의 부록 "테이블 목록"도 실제 스키마와 다르다** (2026-08-12 추가). `users`·`events`·`fact_provenance` 세 테이블은 실제로 존재하지 않는다 — 각각 `profiles` / (DB 아님, 파이프라인 메모리의 `cluster.ts`) / `facts`+`fact_sources`로 구현됐다. a1 부록 머리의 경고 참조.
  - 📌 **a1의 "중단돼도 재개"는 체크포인트를 러너 밖으로 옮겨 해소했다** (2026-08-12). 한동안 구현이 러너의 **로컬 파일**(`pipeline/output/checkpoints/`)이라 a1 §6이 고른 GitHub Actions 에서는 같은 job 안의 재시도만 재개됐다. 지금은 Supabase 실행이 `pipeline_checkpoints` 테이블(마이그레이션 0005)에 쓴다. **다만 실제로 중단된 job 을 재개해 본 기록은 아직 없다** — a1 §2 · feature-status.md §1-A "단계 체크포인트 · 중단 지점 재개"(△) 참조.
  - ⚠️ **a3(UI)는 현재 기본 화면과 다르다.** 지금 기본은 뉴스프린트(1902년 신문) 스킨이고, a3가 규정한 표준 스킨은 다크 모드 폴백이다. feature-status.md §2 G13 참조.
- [design/top10-curation.md](design/top10-curation.md) — Top 10 선정 3층 필터
- [newsprint-cuts/](newsprint-cuts/) — 뉴스프린트 스킨의 기사 컷(제목 이미지) 파일 규칙·생성 프롬프트

## 어디까지 왔고 무엇이 남았나
- [production-readiness.md](production-readiness.md) — 실서비스까지 필요한 것 (우선순위·최단 경로, **2026-08-12 갱신**)
- [enhancement-plan.md](enhancement-plan.md) — 고도화 로드맵. **Batch 1 완료 · Batch 2 일부 완료** — #8 운영자 검수 콘솔 구현됨, #6 중 기사별 OG 메타 구현됨(공유 버튼·OG 이미지는 아직). 미착수는 #5 PWA(manifest 없음), #7 검색
- [DEPLOYMENT.md](DEPLOYMENT.md) — Vercel + Supabase 배포 절차 (0·1·3단계 완료, 2단계 Vercel만 남음)

## 근거 자료
- [research/](research/) — 리서치 원본 r1~r6 (소스·경쟁·파이프라인 실험·법무·소스 확장)
- [qa/](qa/) — 디자인 QA 리포트·스크린샷
- [reports/](reports/) — 페르소나 시뮬레이션 등 검증 보고서
- [reference/](reference/) — 프로젝트 출발점이 된 GPT 대화 원문 (2026-07-10)
