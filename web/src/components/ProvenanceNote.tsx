import Link from "next/link";
import type { Source } from "@/lib/types";
import { countIndependentOutlets } from "@/lib/sourceOutlets";

/**
 * How this article was made — without naming who reported it.
 *
 * Two different things are said here, and they are governed by different
 * rules, which is why one is conditional and the other is not.
 *
 * **Who wrote it** is unconditional. Every article on this site was written
 * by a model from extracted facts and approved by a person before it
 * published; a reader has no way to tell that from the prose, and being told
 * afterwards is worse than being told up front. It is a disclosure, not a
 * reassurance, so the argument for withholding it below the sourcing bar
 * does not apply — an article with thin sourcing needs it more, not less.
 *
 * **How well it was sourced** stays conditional. The outlet list was removed
 * from the reader (operator decision, 2026-08-13), so this claim is one the
 * reader cannot check, and an unverifiable claim has to be true everywhere it
 * appears or it is worth less than silence: the first reader who finds a
 * single-source story described as cross-checked has learned the notice is
 * decoration. Aggregators do not count toward the bar — a Google News link is
 * a pointer to someone else's reporting, not a second newsroom confirming the
 * first, and counting it as one is how two of the four articles published on
 * 2026-08-12 came to look doubly sourced when each rested on one outlet.
 *
 * Below the bar there is still no softer version of the sourcing sentence.
 * There is no honest short phrasing of "one outlet said this" that also
 * reassures, and writing one would be the same mistake in a quieter voice.
 *
 * (The pipeline gate now counts the same way — pipeline/src/config/outlets.ts.
 * Until 2026-08-16 it did not, which is how those two articles published at
 * all.)
 */
export function ProvenanceNote({ sources }: { sources: Source[] }) {
  const crossChecked = countIndependentOutlets(sources) >= 2;

  return (
    <p
      style={{
        margin: "var(--sp-6) 0 0",
        paddingTop: "var(--sp-4)",
        borderTop: "1px solid var(--color-border)",
        fontFamily: "var(--font-ui)",
        fontSize: "var(--fs-sm)",
        lineHeight: 1.7,
        color: "var(--color-text-muted)",
      }}
    >
      {crossChecked ? "여러 매체의 보도를 교차 확인한 사실만으로 쓴 기사입니다. " : null}
      기사 문장은 AI가 새로 썼고, 사람이 검수한 뒤 발행했습니다. 원문을 그대로 옮기지
      않습니다.{" "}
      <Link href="/about" style={{ color: "var(--color-link)" }}>
        우리가 뉴스를 만드는 방법
      </Link>
    </p>
  );
}
