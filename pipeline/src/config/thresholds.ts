/**
 * Numbers that two independent parts of the pipeline have to agree on.
 *
 * `gates/` deliberately does not import from `pipeline/` — a gate is the last
 * check before publication and must not depend on the stage it is checking.
 * That boundary is worth keeping, but it was being kept by writing the same
 * literal in both places, which is not a boundary, it is a copy waiting to
 * drift.
 *
 * `config/` is below both, so both can import from here without either
 * depending on the other.
 */

/**
 * The fewest independently-confirmed facts an article can be built from.
 *
 * Two modules enforce it for different reasons and neither is redundant:
 *
 * - `pipeline/replaceLowUsableFacts.ts` checks it BEFORE paying for a
 *   rewrite, and swaps in another event instead (a1 §2 — catch failure at
 *   the cheapest point).
 * - `gates/twoSource.ts` checks it AFTER, because "zero violations among
 *   zero load-bearing facts" is vacuously true and would otherwise sail
 *   through as a pass.
 *
 * They must not drift apart. If the early check is looser than the gate,
 * every run pays Opus for articles the gate then holds; if it is tighter,
 * the gate's vacuous-pass hole reopens. Before 2026-08-12 both sides wrote
 * `3` separately and nothing connected them.
 *
 * Changing this number is a product decision, not a tuning knob: it is what
 * "우리는 지어내지 않는다" costs in daily article count. A measured run on
 * 2026-08-12 filled 4 of 10 slots at this value.
 */
export const MIN_CONFIRMED_FACTS = 3;
