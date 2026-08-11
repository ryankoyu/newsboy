/**
 * LLMProvider — abstraction over the LLM calls the pipeline needs.
 *
 * Why an interface: no Anthropic API key is provisioned yet (task constraint
 * #1). Every pipeline stage that needs judgment/generation talks to this
 * interface, never to the SDK directly, so the whole pipeline is runnable
 * today with MockLLMProvider and becomes real by swapping the implementation
 * (see llm/anthropic.ts) once a key exists — no call-site changes needed.
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
 * Layer 2 LLM-assisted signal for a single candidate cluster
 * (top10-curation.md §1 Layer 2 "학습 적합성" / "감점" rows). STUB — no
 * implementation calls this yet; selectTop10Rules.ts scores only with
 * code-computable signals (source diversity, Korea relevance, freshness).
 * Wire this in once judgment quality can be checked against real output
 * (top10-curation.md §1 Layer 3 roadmap note: "API 키 연결 시").
 */
export interface LearnabilityAndDemeritInput {
  id: string;
  title: string;
  category: CategorySlug;
  summaries: string[];
}

export interface LearnabilityAndDemeritOutput {
  /** 0-1: narrative clarity, common vocabulary, low background-knowledge requirement. */
  learnabilityScore: number;
  /** 0-1: country-internal-politics minutiae, gossip, sensationalism — higher = more demerit. */
  demeritScore: number;
  reasoning: string;
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
}

export interface GenerateAllLevelsOutput {
  versions: Record<"A2" | "B1" | "B2", RewriteOutput>;
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
   * [3] Layer 2 learnability + demerit scoring (Haiku tier) — STUB, not yet
   * wired into selectTop10Rules.ts. See LearnabilityAndDemeritInput/Output
   * doc comments and top10-curation.md §1 Layer 2. Optional so existing
   * LLMProvider implementations (Mock/Anthropic) that predate this method
   * still satisfy the interface without a breaking change.
   */
  scoreLearnabilityAndDemerit?(
    input: LearnabilityAndDemeritInput,
  ): Promise<LearnabilityAndDemeritOutput>;
}
