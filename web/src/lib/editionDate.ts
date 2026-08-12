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
  return editionDate !== kstToday();
}

/**
 * "Today" is a Korean calendar day, not the server's and not UTC.
 *
 * The readers are in Korea, so the day an edition belongs to is the Korean
 * one. Comparing against a UTC date (what `toISOString()` gives) made every
 * edition look stale between 00:00 and 09:00 KST — precisely the window the
 * app tells readers to expect the brief in ("보통 아침 8시경 도착"). A
 * local-timezone comparison would be wrong the other way round: production
 * renders on a UTC box, not in Seoul.
 *
 * Offset arithmetic on the epoch, so the result does not depend on the
 * timezone the process happens to run in. Korea has no DST, so the +9 is
 * fixed all year.
 */
function kstToday(): string {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** "지난 브리핑" label used by the article viewer (no weekday). */
export function formatPastEditionLabel(editionDate: string): string {
  const d = new Date(`${editionDate}T00:00:00`);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}
