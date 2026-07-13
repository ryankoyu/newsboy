/**
 * Unit tests for AnthropicLLMProvider's cost-optimized paths — combined
 * generation parsing, single-level retry input shape, prompt-caching request
 * structure, and usage extraction.
 *
 * NO REAL API CALLS: a fake client is injected over the SDK instance
 * (TypeScript `private` is compile-time only), and every test asserts on the
 * request the provider WOULD send + how it parses a canned response.
 */

import { describe, expect, it } from "vitest";
import { AnthropicLLMProvider } from "./anthropic.js";
import { COMBINED_SYSTEM_PROMPT, SINGLE_LEVEL_SYSTEM_PROMPT } from "./prompts.js";
import type { ExtractedFact } from "../types.js";

interface CapturedRequest {
  model: string;
  max_tokens: number;
  system: unknown;
  output_config?: unknown;
  messages: Array<{ role: string; content: string }>;
}

function fakeResponse(text: string, usage?: Partial<Record<string, number>>) {
  return {
    content: [{ type: "text", text }],
    usage: {
      input_tokens: usage?.input_tokens ?? 1000,
      output_tokens: usage?.output_tokens ?? 500,
      cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    },
  };
}

/** Build a provider whose client returns `responseText` and records the request. */
function providerWithCannedResponse(
  responseText: string,
  usage?: Partial<Record<string, number>>,
): { provider: AnthropicLLMProvider; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const provider = new AnthropicLLMProvider("test-key-never-used");
  // Replace the private SDK client with a fake — runtime property access.
  (provider as unknown as { client: unknown }).client = {
    messages: {
      create: async (req: CapturedRequest) => {
        captured.push(req);
        return fakeResponse(responseText, usage);
      },
    },
  };
  return { provider, captured };
}

const FACTS: ExtractedFact[] = [
  {
    statement: "The central bank raised rates by half a point.",
    confirmedByOutlets: ["A", "B"],
    sourceCount: 2,
    usedInText: true,
    searchSummaryOnly: true,
  },
  {
    statement: "Analysts expected a smaller increase.",
    confirmedByOutlets: ["A"],
    sourceCount: 1,
    usedInText: false,
    note: "single source",
    searchSummaryOnly: true,
  },
];

function levelJson(level: string) {
  return {
    title: `${level} headline`,
    content: `${level} body text about the rate rise.`,
    wordCount: 7,
    words: [
      {
        term: "benchmark",
        meaningKo: "기준",
        example: "The benchmark rate rose.",
        pronunciation: "BENCH-mark",
        sortOrder: 0,
        isKey: false,
      },
    ],
  };
}

describe("AnthropicLLMProvider.generateAllLevels (combined single-call path)", () => {
  const combinedJson = JSON.stringify({ A2: levelJson("A2"), B1: levelJson("B1"), B2: levelJson("B2") });

  it("makes exactly ONE API call and parses all three levels", async () => {
    const { provider, captured } = providerWithCannedResponse(combinedJson);
    const result = await provider.generateAllLevels({
      eventId: "e1",
      category: "business",
      facts: FACTS,
    });

    expect(captured.length).toBe(1); // the whole point: 1 call, not 3
    expect(result.versions.A2.title).toBe("A2 headline");
    expect(result.versions.B1.title).toBe("B1 headline");
    expect(result.versions.B2.title).toBe("B2 headline");
    expect(result.versions.A2.words[0].term).toBe("benchmark");
  });

  it("sends the full facts exactly once in the user turn", async () => {
    const { provider, captured } = providerWithCannedResponse(combinedJson);
    await provider.generateAllLevels({ eventId: "e1", category: "business", facts: FACTS });

    const userContent = captured[0].messages[0].content;
    const parsed = JSON.parse(userContent);
    expect(parsed.facts).toHaveLength(2);
    expect(parsed.facts[0].confirmedByOutlets).toEqual(["A", "B"]); // full fact objects on first pass
    expect(parsed.category).toBe("business");
  });

  it("uses a cache_control-tagged, byte-stable system prompt (prompt caching)", async () => {
    const { provider, captured } = providerWithCannedResponse(combinedJson);
    await provider.generateAllLevels({ eventId: "e1", category: "business", facts: FACTS });
    await provider.generateAllLevels({ eventId: "e2", category: "world", facts: FACTS });

    for (const req of captured) {
      const system = req.system as Array<{ type: string; text: string; cache_control?: unknown }>;
      expect(Array.isArray(system)).toBe(true);
      expect(system[0].cache_control).toEqual({ type: "ephemeral" });
      // byte-stable across calls — the prefix-match invariant
      expect(system[0].text).toBe(COMBINED_SYSTEM_PROMPT);
    }
    expect((captured[0].system as Array<{ text: string }>)[0].text).toBe(
      (captured[1].system as Array<{ text: string }>)[0].text,
    );
  });

  it("requests structured output (output_config.format json_schema)", async () => {
    const { provider, captured } = providerWithCannedResponse(combinedJson);
    await provider.generateAllLevels({ eventId: "e1", category: "business", facts: FACTS });

    const config = captured[0].output_config as { format: { type: string; schema: Record<string, unknown> } };
    expect(config.format.type).toBe("json_schema");
    expect(config.format.schema.required).toEqual(["A2", "B1", "B2"]);
  });

  it("returns the call's usage for cost tracking", async () => {
    const { provider } = providerWithCannedResponse(combinedJson, {
      input_tokens: 4321,
      output_tokens: 2100,
      cache_read_input_tokens: 900,
    });
    const result = await provider.generateAllLevels({ eventId: "e1", category: "business", facts: FACTS });
    expect(result.usage).toEqual({
      inputTokens: 4321,
      outputTokens: 2100,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 900,
    });
  });

  it("still parses when the model wraps JSON in fences despite structured output", async () => {
    const { provider } = providerWithCannedResponse("```json\n" + combinedJson + "\n```");
    const result = await provider.generateAllLevels({ eventId: "e1", category: "business", facts: FACTS });
    expect(result.versions.B2.title).toBe("B2 headline");
  });
});

describe("AnthropicLLMProvider.rewrite (single-level retry path)", () => {
  const singleJson = JSON.stringify(levelJson("B1"));

  it("sends a compact fact SUMMARY (statements only), not full fact objects", async () => {
    const { provider, captured } = providerWithCannedResponse(singleJson);
    await provider.rewrite({
      eventId: "e1",
      category: "business",
      facts: FACTS,
      level: "B1",
      feedback: "cefr check failed (score=80)",
    });

    const parsed = JSON.parse(captured[0].messages[0].content);
    // Summary: only usedInText statements, as bare strings — no provenance metadata resent.
    expect(parsed.factSummary).toEqual(["The central bank raised rates by half a point."]);
    expect(parsed.facts).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain("confirmedByOutlets");
    expect(parsed.level).toBe("B1");
    expect(parsed.feedback).toContain("cefr check failed");
  });

  it("uses the byte-stable single-level system prompt with cache_control", async () => {
    const { provider, captured } = providerWithCannedResponse(singleJson);
    await provider.rewrite({ eventId: "e1", category: "business", facts: FACTS, level: "A2" });

    const system = captured[0].system as Array<{ text: string; cache_control?: unknown }>;
    expect(system[0].text).toBe(SINGLE_LEVEL_SYSTEM_PROMPT);
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    // level/feedback must be in the user turn, never in the system prompt,
    // or the cache prefix would differ per level.
    expect(system[0].text).not.toContain("feedback");
  });

  it("parses the single-level output and returns usage", async () => {
    const { provider } = providerWithCannedResponse(singleJson, { input_tokens: 700, output_tokens: 350 });
    const out = await provider.rewrite({ eventId: "e1", category: "business", facts: FACTS, level: "B1" });
    expect(out.title).toBe("B1 headline");
    expect(out.usage?.inputTokens).toBe(700);
    expect(out.usage?.outputTokens).toBe(350);
  });
});
