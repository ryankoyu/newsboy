import Link from "next/link";
import type { Source } from "@/lib/types";
import { countIndependentOutlets } from "@/lib/sourceOutlets";

/**
 * How this article was made — without naming who reported it.
 *
 * The outlet list was removed from the reader (operator decision,
 * 2026-08-13). That makes this line the only account a reader gets of where
 * the facts came from, and it means they cannot check it. A claim nobody can
 * verify has to be one that is always true, or it is worth less than saying
 * nothing: the first reader who finds a single-source story described as
 * cross-checked has learned that the notice is decoration.
 *
 * So it renders only when the article actually clears the bar. Aggregators
 * do not count toward it — a Google News link is a pointer to someone else's
 * reporting, not a second newsroom confirming the first, and counting it as
 * one is how two of the four articles published on 2026-08-12 came to look
 * doubly sourced when each rested on a single outlet.
 *
 * Articles below the bar get no notice rather than a softer one. There is no
 * honest short sentence for "one outlet said this and we rewrote it" that
 * also reassures, and inventing one would be the same mistake in a quieter
 * voice.
 */
export function ProvenanceNote({ sources }: { sources: Source[] }) {
  if (countIndependentOutlets(sources) < 2) return null;

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
      여러 매체의 보도를 교차 확인한 사실만으로 새로 작성한 기사입니다. 원문을 그대로
      옮기지 않습니다.{" "}
      <Link href="/about" style={{ color: "var(--color-link)" }}>
        우리가 뉴스를 만드는 방법
      </Link>
    </p>
  );
}
