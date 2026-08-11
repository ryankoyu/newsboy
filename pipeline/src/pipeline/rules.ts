/**
 * [3] Layer 1 — 하드 룰 휴리스틱 (top10-curation.md §1 Layer 1).
 *
 * Pure, code-only heuristics used by selectTop10Rules.ts's greedy selection.
 * Every function here is a stand-in for a judgment an LLM could make better
 * (see llm/provider.ts LearnabilityAndDemeritInput stub) — the heuristics
 * are deliberately conservative (keyword/regex based) and their known
 * failure modes are documented inline so operators reading the
 * selection-report understand what "isPolitical: true" etc. actually means.
 */

import type { EventCluster } from "../types.js";

// ---------------------------------------------------------------------------
// Political-story detection
// ---------------------------------------------------------------------------

/**
 * Keyword heuristic for "this cluster is about domestic politics." Deliberately
 * narrow — misses non-English-keyword framings, opinion pieces without these
 * nouns, and anything phrased around a proper noun alone (e.g. a president's
 * name with no "election/minister/parliament" co-occurring word). False
 * negatives are more likely than false positives here; a real judgment needs
 * an LLM (see LearnabilityAndDemeritInput.demeritScore stub).
 */
const POLITICAL_KEYWORDS = [
  "senator",
  "congress",
  "congressman",
  "congresswoman",
  "parliament",
  "election",
  "minister",
  "prime minister",
  "president",
  "lawmaker",
  "legislator",
  "governor",
  "impeach",
  "cabinet",
  "coalition government",
  "ruling party",
  "opposition party",
  "house speaker",
  "senate",
  "mp ", // "MP " as in Member of Parliament, space-padded to avoid matching inside words
];

export function isPoliticalStory(cluster: EventCluster): boolean {
  return containsWord(clusterText(cluster), POLITICAL_KEYWORDS);
}

/**
 * [한계] Country attribution for a political story is inferred from the
 * source outlets' `country` field (the reporting outlet's edition), NOT from
 * the story's actual subject country — a US outlet can report on French
 * politics. This is a known approximation (task instruction: "국가는 소스 아닌
 * 사건 기준 추정" — the ask is to estimate by the EVENT, but no reliable
 * code-only signal for "which country is this politics about" exists without
 * an LLM or NER pass). We approximate with source country as the best
 * available proxy today, and flag it here so it's visible to whoever reads
 * this code or the selection-report `limitations` field. A real fix needs
 * either an LLM judgment or a named-entity/gazetteer pass over the title.
 */
export function politicalCountryGuess(cluster: EventCluster): string | null {
  return cluster.countries[0] ?? null;
}

// ---------------------------------------------------------------------------
// Tone / casualty detection
// ---------------------------------------------------------------------------

const CASUALTY_KEYWORDS = [
  "dead",
  "die",
  "dies",
  "died",
  "death",
  "deaths",
  "fatalities",
  "injured",
  "wounded",
  "killed",
  "killing",
  "kills",
  "massacre",
  "war",
  "attack",
  "bombing",
  "bomb",
  "airstrike",
  "shooting",
  "gunman",
  "casualties",
  "disaster",
  "earthquake",
  "flood",
  "wildfire",
  "fire",
  "blaze",
  "explosion",
  "crash",
  "fatal",
  "genocide",
  "conflict",
  "invasion",
];

export function isCasualtyStory(cluster: EventCluster): boolean {
  return containsWord(clusterText(cluster), CASUALTY_KEYWORDS);
}

// ---------------------------------------------------------------------------
// Duplicate-subject detection (same person/institution as the lead subject)
// ---------------------------------------------------------------------------

const SUBJECT_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "says", "said", "new", "after", "over", "into", "amid", "how", "what",
  "why", "will", "has", "have", "had", "its", "this", "that",
]);

/**
 * Extracts a crude "lead subject" key from a title: the first run of
 * consecutive Capitalized-Word tokens (proper-noun heuristic), lowercased and
 * joined. E.g. "Mitch McConnell reveals fall..." -> "mitch mcconnell".
 * "US congressman says..." -> "us congressman" (still catches institutional
 * subjects like "US Congress", "EU Commission").
 *
 * [한계] Regex-based proper-noun detection: misses subjects not in title-case
 * (rare in headlines), collapses different people who happen to share a
 * shared capitalized lead word (e.g. two different "President X" stories),
 * and can't resolve co-reference (a subject mentioned only via pronoun later
 * in the cluster). A real implementation needs NER or an LLM judgment.
 */
export function extractSubjectKey(title: string): string | null {
  const words = title.split(/\s+/);
  const capRun: string[] = [];
  for (const w of words) {
    const clean = w.replace(/[^A-Za-z']/g, "");
    if (clean.length === 0) continue;
    const isCap = /^[A-Z]/.test(clean) && !SUBJECT_STOPWORDS.has(clean.toLowerCase());
    if (isCap) {
      capRun.push(clean.toLowerCase());
      // Cap run of at most 3 tokens (e.g. "Mitch McConnell", "US Congress").
      if (capRun.length >= 3) break;
    } else if (capRun.length > 0) {
      break; // run ended
    }
  }
  if (capRun.length === 0) return null;
  return capRun.join(" ");
}

export function clusterSubjectKey(cluster: EventCluster): string | null {
  return extractSubjectKey(cluster.title);
}

// ---------------------------------------------------------------------------
// World-region grouping (for "동일 국가 world 뉴스 최대 2" + regional spread)
// ---------------------------------------------------------------------------

const REGION_BY_COUNTRY: Record<string, string> = {
  US: "americas", CA: "americas", MX: "americas", BR: "americas", AR: "americas",
  GB: "europe", DE: "europe", FR: "europe", IT: "europe", ES: "europe", RU: "europe",
  QA: "middle-east", SA: "middle-east", IL: "middle-east", AE: "middle-east", IR: "middle-east", TR: "middle-east",
  JP: "asia", KR: "asia", CN: "asia", HK: "asia", SG: "asia", IN: "asia", TH: "asia",
  AU: "oceania", NZ: "oceania",
};

export function regionOf(countryCode: string): string {
  return REGION_BY_COUNTRY[countryCode] ?? "other";
}

// ---------------------------------------------------------------------------
// Shared text helper
// ---------------------------------------------------------------------------

/**
 * Whole-word keyword match.
 *
 * Substring matching (the previous behaviour) fired "war" on "wartime"
 * and "warning", and "bomb" on "bombastic" — a wargame tabletop exercise
 * came back flagged as a casualty story. Word boundaries fix that class of
 * false positive; the plural/tense variants that boundaries then exclude
 * are listed explicitly in the keyword arrays instead.
 */
function containsWord(text: string, keywords: readonly string[]): boolean {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean));
  return keywords.some((kw) => (kw.includes(" ") ? text.toLowerCase().includes(kw) : words.has(kw)));
}

function clusterText(cluster: EventCluster): string {
  const summaries = cluster.items.slice(0, 3).map((i) => i.summary).join(" ");
  return `${cluster.title} ${summaries}`;
}
