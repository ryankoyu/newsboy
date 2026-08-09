/**
 * Shared "is this edition today's?" rule — docs/feature-status.md G4
 * ("같은 에디션을 홈은 '오늘', 뷰어는 '지난 브리핑'이라고 말한다").
 *
 * ArticleViewer already compared `edition.edition_date` against the local
 * date to decide whether to show a past-edition label. HomeView accepted an
 * `isPastEdition` prop but nothing computed it for the home route — it
 * defaulted to `false`, so home always greeted with "오늘" even when the
 * latest edition was stale. This helper is the single place both routes
 * call so they can never disagree again.
 */
export function isEditionPast(editionDate: string): boolean {
  const todayStr = new Date().toISOString().slice(0, 10);
  return editionDate !== todayStr;
}

/** "지난 브리핑" label used by the article viewer (no weekday). */
export function formatPastEditionLabel(editionDate: string): string {
  const d = new Date(`${editionDate}T00:00:00`);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}
