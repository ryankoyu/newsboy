/**
 * Real LLM calls via the Anthropic API.
 *
 * Requires ANTHROPIC_API_KEY in env. Throws a clear, specific error at
 * construction time if missing — never silently falls back to mock (task
 * constraint #1: "키 없으면 명확한 에러").
 *
 * Model-tier mapping follows a1-architecture.md §3.1. Model ids are current
 * as of this writing [문서] — check docs/reference or the Anthropic API
 * skill before assuming these ids stay valid long-term.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  ExtractFactsInput,
  LLMProvider,
  ModelTier,
  RewriteInput,
  RewriteOutput,
  SameEventInput,
  Top10Candidate,
  Top10Selection,
} from "./provider.js";
import type { ExtractedFact, WordEntry } from "../types.js";

const MODEL_BY_TIER: Record<ModelTier, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
};

const FABRICATION_GUARDRAIL =
  "You must not invent any fact, number, quote, or name that is not present in the " +
  "provided source material. If information is missing, omit it rather than guessing. " +
  "Never reproduce a source's exact sentences or structure — express everything in " +
  "entirely new wording.";

function extractJson<T>(text: string): T {
  // Claude sometimes wraps JSON in ```json fences despite instructions — strip defensively.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim()) as T;
}

export class AnthropicLLMProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "[AnthropicLLMProvider] ANTHROPIC_API_KEY is not set. This pipeline stage " +
          "requires a real Anthropic API key — set it in the environment, or use " +
          "MockLLMProvider explicitly for local/demo runs (see llm/mock.ts).",
      );
    }
    this.client = new Anthropic({ apiKey: key });
  }

  private async complete(tier: ModelTier, system: string, user: string): Promise<string> {
    const response = await this.client.messages.create({
      model: MODEL_BY_TIER[tier],
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("[AnthropicLLMProvider] no text content in response");
    }
    return textBlock.text;
  }

  async judgeSameEvent(input: SameEventInput): Promise<boolean> {
    const system =
      "You judge whether two news headlines/summaries describe the same real-world " +
      'event. Respond with strict JSON only: {"sameEvent": true|false}.';
    const user = JSON.stringify(input);
    const text = await this.complete("haiku", system, user);
    const parsed = extractJson<{ sameEvent: boolean }>(text);
    return parsed.sameEvent;
  }

  async selectTop10(candidates: Top10Candidate[]): Promise<Top10Selection[]> {
    const system =
      "You select the 10 most important news events for a daily English-learning " +
      "digest read mainly by Korean adults. Criteria: (1) global importance, " +
      "(2) relevance/interest to Korean readers, (3) suitability for language learning, " +
      "(4) balance across categories (World/Korea/AI-Tech/Business/Culture-Sports). " +
      'Respond with strict JSON only: {"selections": [{"id": "...", "rankInEdition": 1, "rationale": "..."}]} ' +
      "with exactly 10 entries, ranked 1-10.";
    const user = JSON.stringify(candidates);
    const text = await this.complete("sonnet", system, user);
    const parsed = extractJson<{ selections: Top10Selection[] }>(text);
    return parsed.selections;
  }

  async extractFacts(input: ExtractFactsInput): Promise<ExtractedFact[]> {
    const system =
      `${FABRICATION_GUARDRAIL} ` +
      "Extract only facts that are explicitly stated in the provided items. For each " +
      "fact, tag which outlets confirm it. A fact is multi-source only if independently " +
      "confirmed by 2+ distinct outlets in the input; otherwise mark it single-source. " +
      "Direct quotes must be copied verbatim from an item's summary or dropped entirely — " +
      "never paraphrase a quote and present it as one. " +
      'Respond with strict JSON only: {"facts": [{"statement": "...", "confirmedByOutlets": ["..."], ' +
      '"sourceCount": 0, "usedInText": true, "note": "...", "searchSummaryOnly": false}]}.';
    const user = JSON.stringify(input);
    const text = await this.complete("sonnet", system, user);
    const parsed = extractJson<{ facts: ExtractedFact[] }>(text);
    return parsed.facts;
  }

  async rewrite(input: RewriteInput): Promise<RewriteOutput> {
    const targets: Record<string, string> = {
      A2: "150-180 words, short simple sentences, present/simple past tense, common vocabulary only",
      B1: "~300 words, compound sentences, moderate vocabulary, clear cause-effect connectors",
      B2: "450-520 words, subordinate clauses allowed, richer vocabulary, but avoid C1-level idioms",
    };
    const system =
      `${FABRICATION_GUARDRAIL} ` +
      `Write a completely new English news article at CEFR level ${input.level} using ONLY the ` +
      `facts provided — do not add outside facts. Target: ${targets[input.level]}. ` +
      "Write a brand-new headline (never reuse a source headline). Also produce 5 key " +
      "vocabulary words with Korean meaning, an example sentence, and a pronunciation hint. " +
      "CRITICAL: every word you select MUST actually appear in the article body you just wrote " +
      "for THIS level (exact word, or a simple inflected form — plural -s/-es, past -ed, " +
      "progressive -ing; multi-word terms like \"lay off\" must appear as that exact phrase). " +
      "Do not pick a word that only appears in your notes, the source facts, or a different " +
      "level's version — a curated word the reader cannot find and click in the text is a " +
      "defect. If fewer than 5 in-text words are suitable, return fewer rather than inventing " +
      "one that isn't in the body. " +
      'Respond with strict JSON only: {"title": "...", "content": "...", "wordCount": 0, ' +
      '"words": [{"term": "...", "meaningKo": "...", "example": "...", "pronunciation": "...", "sortOrder": 0}]}.' +
      (input.feedback ? ` Previous attempt failed a quality gate: ${input.feedback}. Fix this specifically.` : "");
    const user = JSON.stringify({ facts: input.facts, category: input.category });
    const text = await this.complete("opus", system, user);
    const parsed = extractJson<RewriteOutput>(text);
    return parsed;
  }

  async judgeCefrBand(input: {
    text: string;
    targetLevel: "A2" | "B1" | "B2";
  }): Promise<{ withinBand: boolean; reasoning: string }> {
    const system =
      "You are a CEFR reading-level assessor. Judge whether the given text fits the " +
      'target CEFR band. Respond with strict JSON only: {"withinBand": true|false, "reasoning": "..."}.';
    const user = JSON.stringify(input);
    const text = await this.complete("haiku", system, user);
    return extractJson<{ withinBand: boolean; reasoning: string }>(text);
  }
}
