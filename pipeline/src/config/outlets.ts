/**
 * Which outlets count as independent confirmation of a fact.
 *
 * `ExtractedFact.confirmedByOutlets` holds outlet display names the model
 * copied out of the items it was given (llm/provider.ts ExtractFactsInput).
 * Counting those names is not the same as counting newsrooms, and the gap
 * between the two is how the 2026-08-12 edition published two single-source
 * stories as cross-checked: "Nikkei Asia" + "Google News (Economy)" is two
 * names and one newsroom. An aggregator link is a pointer to someone else's
 * reporting, not a second newsroom confirming the first.
 *
 * Two names also collapse into one outlet when they are the same outlet's
 * different feeds — "Korea Herald (Sports)" and "Korea Herald (Life &
 * Culture)". config/sources.ts already carries `outletKey` for exactly this,
 * and RawItem copies it through, so resolving a name back to the item it came
 * from catches both cases with one lookup.
 *
 * sources.ts has claimed since it was written that `outletKey` exists "so the
 * 2-source gate treats them as one source". Nothing did that until this
 * module: the gate counted `new Set(confirmedByOutlets)` and never saw an
 * outletKey at all. The comment described an intention, not the code.
 *
 * `config/` is below both `gates/` and `pipeline/`, so the extraction rule
 * and the final gate can share this without either depending on the other —
 * the same reason thresholds.ts lives here.
 *
 * The web display layer keeps its own copy of this rule
 * (web/src/lib/sourceOutlets.ts), keyed on URL hostname because the Source
 * rows shipped to the browser carry no outletKey. Two implementations of one
 * rule is a real cost and worth removing when the two packages share a
 * module; until then, the alternative is counting differently on screen than
 * in the gate, which is how a reader ends up trusting a claim the gate never
 * made.
 */

/**
 * The shape this module needs from a source item — structurally satisfied by
 * RawItem. Kept minimal so config/ does not pull in the pipeline's types.
 */
export interface OutletIdentitySource {
  outlet: string;
  /** From SourceConfig.outletKey; absent on hand-built fixtures. */
  outletKey?: string;
}

/**
 * Outlets that carry other newsrooms' reporting rather than doing their own.
 *
 * Keyed by `outletKey` (config/sources.ts) — every Google News query feed
 * shares the key "google-news", so one entry covers all eleven of them.
 */
const AGGREGATOR_OUTLET_KEYS = new Set(["google-news"]);

/**
 * Fallback for a name that matched no item, where there is no outletKey to
 * check. A model that answers "Google News" when the item was labelled
 * "Google News (Economy)" must not score as a newsroom on the strength of
 * the mismatch.
 */
const AGGREGATOR_NAME_PATTERN = /google\s*news/i;

function normalize(outletName: string): string {
  return outletName.trim().toLowerCase();
}

export function isAggregatorOutlet(outletName: string, outletKey?: string): boolean {
  if (outletKey !== undefined) return AGGREGATOR_OUTLET_KEYS.has(outletKey);
  return AGGREGATOR_NAME_PATTERN.test(outletName);
}

/**
 * How many distinct newsrooms actually confirm a fact.
 *
 * Each name is resolved against `items` to find the outlet it came from:
 * matched names count once per `outletKey` (so sibling feeds of one outlet
 * collapse), aggregators do not count at all, and a name matching no item
 * counts under itself — it cannot be verified either way, and silently
 * dropping unmatched names would tighten the gate by an amount nobody
 * measured. Matching is case-insensitive on the trimmed name.
 */
export function countIndependentOutlets(
  confirmedByOutlets: readonly string[],
  items: readonly OutletIdentitySource[],
): number {
  const byName = new Map<string, OutletIdentitySource>();
  for (const item of items) byName.set(normalize(item.outlet), item);

  const identities = new Set<string>();
  for (const name of confirmedByOutlets) {
    const normalized = normalize(name);
    const item = byName.get(normalized);
    if (isAggregatorOutlet(item?.outlet ?? name, item?.outletKey)) continue;
    identities.add(item?.outletKey ?? normalized);
  }
  return identities.size;
}
