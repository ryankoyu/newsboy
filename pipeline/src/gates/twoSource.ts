/**
 * [6c] 2소스 검증 재확인 — a1-architecture.md §2 [6c].
 *
 * Final check before publication: every fact still marked `usedInText` must
 * have 2+ distinct confirming outlets. This re-runs the same rule as
 * pipeline/extract.ts's enforceTwoSourceRule — deliberately redundant. A1
 * calls this out as a *separate* final gate (not just relying on stage [4]
 * having done it once), because facts could in principle be re-flagged
 * between extraction and publication in a future version of the pipeline.
 *
 * FIX (2026-07-14 two-source bypass incident): the ORIGINAL version of this
 * check only rejected facts that were BOTH `usedInText: true` AND
 * under-sourced. That meant an article whose body was actually built from
 * zero corroborated facts (loadBearingFacts === 0 — e.g. because rewrite
 * used single-source facts as filler, or a future bug reintroduces that
 * path) sailed through with `violatingCount === 0`, since "zero violations
 * among zero load-bearing facts" is vacuously true. The gate is the LAST
 * line of defense before publication (pipeline/replaceLowUsableFacts.ts is
 * the cheaper, earlier line — see its doc comment), so it must not have the
 * same blind spot: a version with fewer than MIN_LOAD_BEARING_FACTS
 * confirmed facts now fails outright, regardless of whether any individual
 * fact is "violating" in isolation. This does NOT re-parse the rewritten
 * prose to check which facts it actually cites — that would need real NLP
 * fact-matching, out of scope here — it closes the specific vacuous-pass
 * hole where zero usable facts read as zero violations.
 *
 * FIX (2026-08-16 inflated source count): counting `confirmedByOutlets` as a
 * set of strings counted an aggregator link as a newsroom, and one outlet's
 * two feeds as two outlets. Two of the four articles published on 2026-08-12
 * cleared this gate that way, each resting on a single newsroom. The count
 * now goes through config/outlets.ts, which resolves every name back to the
 * item it came from — so this gate and the notice the reader is shown
 * (web/src/components/ProvenanceNote.tsx) finally answer the same question.
 * That is why the source items are now a parameter: the names alone never
 * carried enough information to count honestly.
 */

import type { ExtractedFact } from "../types.js";
import { countIndependentOutlets } from "../config/outlets.js";
import type { OutletIdentitySource } from "../config/outlets.js";

const MIN_SOURCES = 2;

/**
 * An article needs SOME independently-confirmed factual basis to be worth
 * publishing at all.
 *
 * Shared with replaceLowUsableFacts.ts through config/, which sits below
 * both — so gates/ still does not import from pipeline/, and the two can no
 * longer drift apart. They used to be separate literals that happened to
 * both say 3.
 */
import { MIN_CONFIRMED_FACTS } from "../config/thresholds.js";

const MIN_LOAD_BEARING_FACTS = MIN_CONFIRMED_FACTS;

export interface TwoSourceCheckResult {
  passed: boolean;
  violatingFacts: string[];
  detail: Record<string, unknown>;
}

export function checkTwoSourceRule(
  facts: ExtractedFact[],
  /**
   * The items the facts were extracted from. Required, not optional: an
   * optional parameter is how a caller silently gets the old, inflated count
   * back, and this is the last gate before publication.
   */
  sourceItems: readonly OutletIdentitySource[],
): TwoSourceCheckResult {
  const loadBearing = facts.filter((f) => f.usedInText);
  const violating = loadBearing.filter(
    (f) => countIndependentOutlets(f.confirmedByOutlets, sourceItems) < MIN_SOURCES,
  );
  const insufficientLoadBearing = loadBearing.length < MIN_LOAD_BEARING_FACTS;

  return {
    passed: violating.length === 0 && !insufficientLoadBearing,
    violatingFacts: violating.map((f) => f.statement),
    detail: {
      totalFacts: facts.length,
      loadBearingFacts: loadBearing.length,
      violatingCount: violating.length,
      minSourcesRequired: MIN_SOURCES,
      minLoadBearingFactsRequired: MIN_LOAD_BEARING_FACTS,
      insufficientLoadBearing,
    },
  };
}
