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
 *
 * COST OPTIMIZATION (2026-07-13, see docs — pipeline cost review):
 *  1. generateAllLevels() produces A2+B1+B2+words in ONE call per event
 *     (source facts sent once, not 3x). rewrite() is now reserved for
 *     single-level gate-failure retries, and receives a compact fact
 *     SUMMARY rather than the full extracted-fact list, since a retry only
 *     needs enough context to fix the failing dimension.
 *  2. System prompts (prompts.ts) are byte-stable across calls and carry
 *     cache_control so repeated calls hit Anthropic's prompt cache
 *     (shared/prompt-caching.md: prefix match, ~90% cheaper reads).
 *  3. Structured outputs (output_config.format) replace manual ```json
 *     fence-stripping as the primary parse path — extractJson() is now a
 *     defensive fallback only.
 *  4. Every call's usage (input/output/cache tokens) is returned on the
 *     result so callers can accumulate cost — see llm/cost.ts.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  ExtractFactsInput,
  GenerateAllLevelsInput,
  GenerateAllLevelsOutput,
  LLMProvider,
  ModelTier,
  RewriteInput,
  RewriteOutput,
  SameEventInput,
  Top10Candidate,
  Top10Selection,
} from "./provider.js";
import type { ExtractedFact, WordEntry, CefrLevel } from "../types.js";
import type { CallUsage } from "./cost.js";
import { emptyUsage } from "./cost.js";
import {
  COMBINED_OUTPUT_SCHEMA,
  COMBINED_SYSTEM_PROMPT,
  SINGLE_LEVEL_OUTPUT_SCHEMA,
  SINGLE_LEVEL_SYSTEM_PROMPT,
} from "./prompts.js";

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
  // Structured outputs (output_config.format) should make this a no-op most
  // of the time, but Claude occasionally still wraps JSON in ```json fences —
  // strip defensively rather than trust the format guarantee unconditionally.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim()) as T;
}

function usageFromResponse(response: { usage: Anthropic.Usage }): CallUsage {
  const u = response.usage;
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
  };
}

/**
 * Compact fact summary for single-level retries — sends the statement text
 * only (no outlet/provenance metadata, which the retry doesn't need to
 * regenerate one level's prose). This is the "요약본만 재전송" behavior the
 * task requires: full ExtractedFact[] objects (with confirmedByOutlets,
 * sourceCount, note, searchSummaryOnly) are NOT resent on retry.
 */
function summarizeFactsForRetry(facts: ExtractedFact[]): string[] {
  return facts.filter((f) => f.usedInText).map((f) => f.statement);
}

interface RawLevelOutput {
  title: string;
  content: string;
  wordCount: number;
  words: WordEntry[];
}

function toRewriteOutput(raw: RawLevelOutput, usage?: CallUsage): RewriteOutput {
  return {
    title: raw.title,
    content: raw.content,
    wordCount: raw.wordCount,
    words: raw.words,
    usage,
  };
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

  private async complete(
    tier: ModelTier,
    system: string,
    user: string,
  ): Promise<{ text: string; usage: CallUsage }> {
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
    return { text: textBlock.text, usage: usageFromResponse(response) };
  }

  /**
   * Structured-output call with a cached (cache_control-tagged) system
   * prompt. `system` must be a byte-stable string across calls for the
   * cache breakpoint to ever hit — see prompts.ts doc comment.
   */
  private async completeStructured(
    tier: ModelTier,
    system: string,
    user: string,
    schema: Record<string, unknown>,
  ): Promise<{ text: string; usage: CallUsage }> {
    const response = await this.client.messages.create({
      model: MODEL_BY_TIER[tier],
      max_tokens: 8192,
      // Fixed prefix first (system, cached), then per-call user content —
      // shared/prompt-caching.md render order: tools -> system -> messages.
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" },
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema,
        },
      },
      messages: [{ role: "user", content: user }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("[AnthropicLLMProvider] no text content in response");
    }
    return { text: textBlock.text, usage: usageFromResponse(response) };
  }

  async judgeSameEvent(input: SameEventInput): Promise<boolean> {
    const system =
      "You judge whether two news headlines/summaries describe the same real-world " +
      'event. Respond with strict JSON only: {"sameEvent": true|false}.';
    const user = JSON.stringify(input);
    const { text } = await this.complete("haiku", system, user);
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
    const { text } = await this.complete("sonnet", system, user);
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
    const { text } = await this.complete("sonnet", system, user);
    const parsed = extractJson<{ facts: ExtractedFact[] }>(text);
    return parsed.facts;
  }

  /**
   * PRIMARY generation path: A2 + B1 + B2 + words in one call. Source facts
   * are sent exactly once (cost optimization #1). Uses structured outputs +
   * a cached system prompt (cost optimization #2).
   */
  async generateAllLevels(input: GenerateAllLevelsInput): Promise<GenerateAllLevelsOutput> {
    const user = JSON.stringify({ facts: input.facts, category: input.category });
    const { text, usage } = await this.completeStructured(
      "opus",
      COMBINED_SYSTEM_PROMPT,
      user,
      COMBINED_OUTPUT_SCHEMA,
    );
    const parsed = extractJson<Record<CefrLevel, RawLevelOutput>>(text);

    return {
      versions: {
        A2: toRewriteOutput(parsed.A2),
        B1: toRewriteOutput(parsed.B1),
        B2: toRewriteOutput(parsed.B2),
      },
      usage,
    };
  }

  /**
   * Single-level retry path — used only when one level fails its quality
   * gate. Sends a compact fact SUMMARY (statement text only), not the full
   * ExtractedFact[] with provenance metadata, since a retry needs just
   * enough context to regenerate one level's prose (cost optimization #1:
   * "실패한 레벨만 개별 재생성...이때 소스는 요약본만 재전송").
   */
  async rewrite(input: RewriteInput): Promise<RewriteOutput> {
    const factSummary = summarizeFactsForRetry(input.facts);
    const user = JSON.stringify({
      factSummary,
      category: input.category,
      level: input.level,
      feedback: input.feedback,
    });
    const { text, usage } = await this.completeStructured(
      "opus",
      SINGLE_LEVEL_SYSTEM_PROMPT,
      user,
      SINGLE_LEVEL_OUTPUT_SCHEMA,
    );
    const parsed = extractJson<RawLevelOutput>(text);
    return toRewriteOutput(parsed, usage);
  }

  async judgeCefrBand(input: {
    text: string;
    targetLevel: "A2" | "B1" | "B2";
  }): Promise<{ withinBand: boolean; reasoning: string }> {
    const system =
      "You are a CEFR reading-level assessor. Judge whether the given text fits the " +
      'target CEFR band. Respond with strict JSON only: {"withinBand": true|false, "reasoning": "..."}.';
    const user = JSON.stringify(input);
    const { text } = await this.complete("haiku", system, user);
    return extractJson<{ withinBand: boolean; reasoning: string }>(text);
  }
}
