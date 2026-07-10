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
}

export interface LLMProvider {
  readonly name: string;

  /** [2] Boundary-case same-event judgment (Haiku tier). */
  judgeSameEvent(input: SameEventInput): Promise<boolean>;

  /** [3] Top 10 selection with category balance (Sonnet tier). */
  selectTop10(candidates: Top10Candidate[]): Promise<Top10Selection[]>;

  /** [4] Fact extraction with provenance tagging (Sonnet tier). */
  extractFacts(input: ExtractFactsInput): Promise<ExtractedFact[]>;

  /** [5] Level-specific rewrite from facts only (Opus tier). */
  rewrite(input: RewriteInput): Promise<RewriteOutput>;

  /** [6a] CEFR boundary judgment when the heuristic checker is inconclusive (Haiku tier). */
  judgeCefrBand(input: { text: string; targetLevel: "A2" | "B1" | "B2" }): Promise<{
    withinBand: boolean;
    reasoning: string;
  }>;
}
