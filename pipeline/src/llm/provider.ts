/**
 * LLMProvider — abstraction over the LLM calls the pipeline needs.
 *
 * Why an interface: a real run costs about $1.04 of Anthropic credit, so the
 * pipeline has to stay runnable without spending it. Every stage that needs
 * judgment/generation talks to this interface, never to the SDK directly —
 * LLM_PROVIDER swaps AnthropicLLMProvider (llm/anthropic.ts, the default) for
 * MockLLMProvider with no call-site changes.
 *
 * Model-tier guidance per a1-architecture.md §3.1 is encoded in the `tier`
 * argument each method takes; concrete providers decide which model id that
 * maps to.
 */

import type { CategorySlug, ExtractedFact, RawItem, WordEntry } from "../types.js";
import type { CallUsage } from "./cost.js";

export type ModelTier = "haiku" | "sonnet" | "opus";

export interface SameEventInput {
  a: { title: string; summary: string };
  b: { title: string; summary: string };
}

export interface Top10Candidate {
  id: string;
  title: string;
  category: CategorySlug;
  outletCount: number;
  summaries: string[];
}

export interface Top10Selection {
  id: string;
  rankInEdition: number;
  rationale: string;
}

/**
 * Layer 2 LLM-assisted signals (top10-curation.md §1 Layer 2 "학습 적합성" /
 * "감점" rows), scored for the whole candidate list in ONE call.
 *
 * Per-candidate calls were the obvious shape and the wrong one: ~20-30
 * candidates survive the 2-source gate on a real collect, and 30 Haiku calls
 * to grade a paragraph each costs more and takes longer than one call
 * grading all thirty — with no benefit, since the judgments are independent
 * and short.
 */
export interface LearnabilityAndDemeritInput {
  id: string;
  title: string;
  category: CategorySlug;
  summaries: string[];
}

export interface LearnabilityAndDemeritOutput {
  /** Echoes the input id — the array is matched by id, never by position. */
  id: string;
  /** 0-1: narrative clarity, common vocabulary, low background-knowledge requirement. */
  learnabilityScore: number;
  /** 0-1: country-internal-politics minutiae, gossip, sensationalism — higher = more demerit. */
  demeritScore: number;
  reasoning: string;
}

export interface LearnabilityAndDemeritResult {
  scores: LearnabilityAndDemeritOutput[];
  usage?: CallUsage;
}

export interface ExtractFactsInput {
  eventId: string;
  category: CategorySlug;
  title: string;
  /** [{outlet, url, title, summary}] — RSS-summary text only, per sourcing strategy §1. */
  items: RawItem[];
}

export interface RewriteInput {
  eventId: string;
  category: CategorySlug;
  facts: ExtractedFact[];
  level: "A2" | "B1" | "B2";
  /** Present when this is a gate-failure retry (A1 §3.2: feed back which metric was exceeded). */
  feedback?: string;
  /**
   * The beat list the other two levels were written to. Passed on retries so
   * a regenerated level lands back on the same paragraphs — without it, the
   * levels that needed rework are exactly the ones that lose alignment.
   */
  paragraphPlan?: string[];
}

export interface RewriteOutput {
  title: string;
  content: string;
  wordCount: number;
  words: WordEntry[];
  /** Present when the concrete provider tracks token usage (Anthropic; absent for Mock). */
  usage?: CallUsage;
}

/**
 * [5] Combined single-call input: generate A2 + B1 + B2 + words for one
 * event in ONE API request instead of three (cost optimization #1 — source
 * facts are sent once instead of three times).
 */
export interface GenerateAllLevelsInput {
  eventId: string;
  category: CategorySlug;
  facts: ExtractedFact[];
  /**
   * The operator's note from a 반려(재생성 요청) — production-readiness.md §2.
   * Set only by pipeline/regenerate.ts, never by the nightly run. It steers
   * the rewrite ("본문이 너무 딱딱하다", "제목이 원문과 비슷하다") but grants
   * no licence to add facts: the fabrication guardrail still holds, so a note
   * asking for information the fact list doesn't have gets nothing.
   */
  deskFeedback?: string;
}

export interface GenerateAllLevelsOutput {
  versions: Record<"A2" | "B1" | "B2", RewriteOutput>;
  /** Beats every level was written to, in order. Empty if the model omitted it. */
  paragraphPlan: string[];
  /** Combined usage for the single call that produced all three levels. */
  usage?: CallUsage;
}

/** A same-event judgment plus the usage of the call that produced it. */
export interface SameEventResult {
  sameEvent: boolean;
  usage?: CallUsage;
}

/** A CEFR band judgment plus the usage of the call that produced it. */
export interface CefrBandResult {
  withinBand: boolean;
  reasoning: string;
  usage?: CallUsage;
}

/** Selections plus the usage of the call that produced them. */
export interface Top10SelectionResult {
  selections: Top10Selection[];
  /** Present when the concrete provider tracks token usage (Anthropic; absent for Mock). */
  usage?: CallUsage;
}

/** Extracted facts plus the usage of the call that produced them. */
export interface ExtractFactsResult {
  facts: ExtractedFact[];
  usage?: CallUsage;
}

export interface LLMProvider {
  readonly name: string;

  /** [2] Boundary-case same-event judgment (Haiku tier). */
  judgeSameEvent(input: SameEventInput): Promise<SameEventResult>;

  /**
   * [3] Top 10 selection with category balance (Sonnet tier).
   *
   * Returns usage alongside the selections so the run ledger can price this
   * call. It used to return the bare array, which is why select never showed
   * up in a cost summary even though it makes a real Sonnet call.
   */
  selectTop10(candidates: Top10Candidate[]): Promise<Top10SelectionResult>;

  /** [4] Fact extraction with provenance tagging (Sonnet tier). Usage as above. */
  extractFacts(input: ExtractFactsInput): Promise<ExtractFactsResult>;

  /**
   * [5] Combined single-call generation of all three CEFR levels + words
   * (Opus tier). This is the PRIMARY path — cost optimization #1: source
   * facts are sent once per event instead of once per level (3x). Preferred
   * over `rewrite()` for the initial draft of every event.
   */
  generateAllLevels(input: GenerateAllLevelsInput): Promise<GenerateAllLevelsOutput>;

  /**
   * [5b] Single-level rewrite — used ONLY for gate-failure retries of one
   * specific level (cost optimization #1: retry sends a compact fact summary,
   * not the full source material, since only one level needs regenerating).
   * Concrete providers may also use this as a fallback path.
   */
  rewrite(input: RewriteInput): Promise<RewriteOutput>;

  /** [6a] CEFR boundary judgment when the heuristic checker is inconclusive (Haiku tier). */
  judgeCefrBand(input: { text: string; targetLevel: "A2" | "B1" | "B2" }): Promise<CefrBandResult>;

  /**
   * [3] Layer 2 learnability + demerit scoring for the whole candidate list
   * (Haiku tier) — top10-curation.md §1 Layer 2. Still optional on the
   * interface: selectTop10 treats a provider without it as "no signal" and
   * scores on the code-computable signals alone, so a third-party or
   * cut-down provider stays usable.
   */
  scoreLearnabilityAndDemerit?(
    inputs: LearnabilityAndDemeritInput[],
  ): Promise<LearnabilityAndDemeritResult>;

  /**
   * [5c] Korean meaning + part of speech for a batch of words (Haiku tier) —
   * the dictionary behind every non-curated word in a body.
   *
   * Optional for the same reason as scoreLearnabilityAndDemerit: a provider
   * without it degrades to what the reader had before (the empty card), never
   * to a failed edition. pipeline/glossary.ts checks before calling.
   */
  generateGlosses?(input: GenerateGlossesInput): Promise<GenerateGlossesResult>;
}

export interface GenerateGlossesInput {
  /** Lowercased surface forms, as they appear in article bodies. */
  terms: string[];
}

export interface GenerateGlossesResult {
  /**
   * One entry per word the model could gloss. Deliberately allowed to be
   * shorter than the input: the prompt asks it to skip proper nouns rather
   * than invent a description of a company or a person.
   */
  entries: Array<{ term: string; meaningKo: string | null; pos?: string | null }>;
  usage?: CallUsage;
}
