/**
 * MockLLMProvider — deterministic stand-in for LLM calls, used for the
 * demo/e2e run (task constraint #1: "LLM API 키 없음... 데모 실행은 mock으로").
 *
 * Shapes returned mirror the real, hand-verified output in
 * docs/research/r3-pipeline-experiment.md (word counts, fact-table style,
 * key-word format, CEFR self-assessment) so downstream code — quality gates,
 * storage — is exercised against realistic structure, not placeholder stubs.
 *
 * This is NOT a language model: it does simple template filling from the
 * facts it's given. It does not "understand" the input, so its rewrite
 * quality is not representative of real output — it exists purely to make
 * the pipeline's plumbing (extract -> rewrite -> gate -> store) runnable
 * end-to-end without an API key.
 */

import type {
  ExtractFactsInput,
  GenerateAllLevelsInput,
  GenerateAllLevelsOutput,
  LLMProvider,
  RewriteInput,
  RewriteOutput,
  SameEventInput,
  Top10Candidate,
  Top10Selection,
  SameEventResult,
  CefrBandResult,
  Top10SelectionResult,
  ExtractFactsResult,
} from "./provider.js";
import type { CefrLevel, ExtractedFact, WordEntry } from "../types.js";

function countOutlets(items: ExtractFactsInput["items"]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    map.set(item.outlet, (map.get(item.outlet) ?? 0) + 1);
  }
  return map;
}

/** Sentence-level lexical overlap so the same fact stated by 2+ outlets is detected. */
function groupSimilarSentences(items: ExtractFactsInput["items"]): Array<{
  statement: string;
  outlets: Set<string>;
}> {
  const groups: Array<{ statement: string; outlets: Set<string>; tokens: Set<string> }> = [];

  for (const item of items) {
    const sentences = item.summary
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);
    const candidateSentences = sentences.length > 0 ? sentences : [item.summary || item.title];

    for (const sentence of candidateSentences) {
      const tokens = new Set(
        sentence
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((t) => t.length > 3),
      );
      let matched = false;
      for (const group of groups) {
        let overlap = 0;
        for (const t of tokens) if (group.tokens.has(t)) overlap++;
        const ratio = tokens.size === 0 ? 0 : overlap / tokens.size;
        if (ratio > 0.5) {
          group.outlets.add(item.outlet);
          matched = true;
          break;
        }
      }
      if (!matched) {
        groups.push({ statement: sentence, outlets: new Set([item.outlet]), tokens });
      }
    }
  }

  return groups.map(({ statement, outlets }) => ({ statement, outlets }));
}

export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";

  async judgeSameEvent(input: SameEventInput): Promise<SameEventResult> {
    // Conservative default: mock treats boundary cases as distinct events
    // unless titles share an obvious substring, keeping cluster() testable
    // without pretending to have real semantic judgment.
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const aWords = new Set(normalize(input.a.title).split(/\s+/).filter((w) => w.length > 3));
    const bWords = new Set(normalize(input.b.title).split(/\s+/).filter((w) => w.length > 3));
    let shared = 0;
    for (const w of aWords) if (bWords.has(w)) shared++;
    // No API call, so no usage to report.
    return { sameEvent: shared >= 2 };
  }

  async selectTop10(candidates: Top10Candidate[]): Promise<Top10SelectionResult> {
    // Rank by outlet count (proxy for cross-source importance), then keep
    // category diversity by taking at most 3 per category before backfilling.
    const sorted = [...candidates].sort((a, b) => b.outletCount - a.outletCount);
    const perCategory = new Map<string, number>();
    const picked: Top10Candidate[] = [];
    const overflow: Top10Candidate[] = [];

    for (const c of sorted) {
      const count = perCategory.get(c.category) ?? 0;
      if (count < 3 && picked.length < 10) {
        picked.push(c);
        perCategory.set(c.category, count + 1);
      } else {
        overflow.push(c);
      }
    }
    for (const c of overflow) {
      if (picked.length >= 10) break;
      picked.push(c);
    }

    // The mock makes no API call, so there is no usage to report.
    const selections = picked.slice(0, 10).map((c, idx) => ({
      id: c.id,
      rankInEdition: idx + 1,
      rationale: `[mock] outletCount=${c.outletCount}, category=${c.category} — selected for cross-source corroboration and category balance.`,
    }));
    return { selections };
  }

  async extractFacts(input: ExtractFactsInput): Promise<ExtractFactsResult> {
    const groups = groupSimilarSentences(input.items);
    const facts: ExtractedFact[] = groups
      .slice(0, 12) // cap — mirrors R3's ~10-12 facts per event
      .map((g) => {
        const sourceCount = g.outlets.size;
        return {
          statement: g.statement,
          confirmedByOutlets: [...g.outlets],
          sourceCount,
          usedInText: sourceCount >= 2,
          note: sourceCount < 2 ? "single source, not used as load-bearing fact" : undefined,
          searchSummaryOnly: true, // mock only ever sees RSS summaries, never full text
        } satisfies ExtractedFact;
      });
    return { facts };
  }

  /**
   * Shared templating logic for one level. Extracted so both `rewrite()`
   * (single-level retry path) and `generateAllLevels()` (combined path,
   * mirroring AnthropicLLMProvider's cost-optimized primary path) produce
   * the same shape of output from the same facts.
   */
  private renderLevel(facts: ExtractedFact[], level: CefrLevel): RewriteOutput {
    // NOTE (2026-07-14 two-source bypass fix): this used to fall back to
    // ALL facts (including single-source ones) when `usable` was empty,
    // which meant a rewrite could be built entirely out of facts the
    // two-source rule had just excluded. run.ts now refuses to call rewrite
    // at all when an event has too few usable facts (see
    // MIN_USABLE_FACTS_TO_REWRITE / replaceLowUsableFactEvents), so this
    // path should be unreachable in practice — but the mock must still never
    // silently launder single-source facts into "load-bearing" prose if it
    // is reached, so it renders an explicit placeholder instead of a normal
    // article body.
    const usable = facts.filter((f) => f.usedInText);
    if (usable.length === 0) {
      const content =
        "This story could not be corroborated by two or more independent sources and was not written.";
      return {
        title: "[Mock] Insufficient corroboration",
        content,
        wordCount: content.split(/\s+/).filter(Boolean).length,
        words: [],
      };
    }
    const factLines = usable.map((f) => f.statement);

    const wordTargets: Record<string, number> = { A2: 165, B1: 300, B2: 480 };
    const target = wordTargets[level];

    // Simple template: level A2 keeps sentences short/split, B1 joins some
    // with connectors, B2 adds an evaluative closing paragraph — mirrors the
    // *shape* of R3's real output, not its literary quality.
    let paragraphs: string[];
    if (level === "A2") {
      paragraphs = factLines.map((line) => line.replace(/\s+/g, " ").trim());
    } else if (level === "B1") {
      paragraphs = [];
      for (let i = 0; i < factLines.length; i += 2) {
        const pair = factLines.slice(i, i + 2).join(" In addition, ");
        paragraphs.push(pair);
      }
    } else {
      paragraphs = [];
      for (let i = 0; i < factLines.length; i += 2) {
        const pair = factLines.slice(i, i + 2).join(", while ");
        paragraphs.push(pair);
      }
      paragraphs.push(
        "For readers following this story, the development is a useful case study in how quickly a single event can ripple outward — a reminder that today's news often becomes tomorrow's turning point.",
      );
    }

    let content = paragraphs.filter(Boolean).join("\n\n");
    // Pad/trim toward the target word count so the CEFR-heuristic gate has a
    // realistic (not trivially-short) text to evaluate.
    const currentWords = content.split(/\s+/).filter(Boolean).length;
    if (currentWords < target) {
      const filler =
        level === "A2"
          ? " This is important news. Many people are talking about it."
          : level === "B1"
            ? " Observers say the situation is likely to keep developing over the coming days, and many are watching closely to see what happens next."
            : " Analysts caution that the full implications may not become clear for some time, and the story is likely to continue evolving as more information emerges from those directly involved.";
      let padded = content;
      while (padded.split(/\s+/).filter(Boolean).length < target) {
        padded += filler;
      }
      content = padded;
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;

    // isKey is always false in mock output: the mock does no real CEFR/
    // vocabulary judgment, so it can't honestly decide "hard but essential"
    // (design-decisions.md §4.8-4). Field is present so downstream code
    // (gate/storage/UI) is exercised against the real shape either way.
    const words: WordEntry[] = usable.slice(0, 5).map((f, idx) => ({
      term: (f.statement.split(/\s+/).find((w) => w.length > 6) ?? "development").replace(/[^a-zA-Z]/g, "").toLowerCase(),
      meaningKo: "[mock] 사전 미연동 — 실제 뜻은 사전 API로 검증 필요",
      example: f.statement,
      pronunciation: "[mock-ipa]",
      sortOrder: idx,
      isKey: false,
    }));

    const titleSeed = factLines[0] ?? "Today's top story";
    const title = `[Mock ${level}] ${titleSeed.split(" ").slice(0, 8).join(" ")}`;

    return { title, content, wordCount, words };
  }

  /**
   * Combined path (mirrors AnthropicLLMProvider.generateAllLevels — the
   * mock has no real per-call cost, but implements the same interface shape
   * so pipeline code exercises the real combined-call structure in tests).
   */
  async generateAllLevels(input: GenerateAllLevelsInput): Promise<GenerateAllLevelsOutput> {
    return {
      versions: {
        A2: this.renderLevel(input.facts, "A2"),
        B1: this.renderLevel(input.facts, "B1"),
        B2: this.renderLevel(input.facts, "B2"),
      },
    };
  }

  /** Single-level retry path — mirrors AnthropicLLMProvider.rewrite(). */
  async rewrite(input: RewriteInput): Promise<RewriteOutput> {
    return this.renderLevel(input.facts, input.level);
  }

  async judgeCefrBand(input: {
    text: string;
    targetLevel: "A2" | "B1" | "B2";
  }): Promise<CefrBandResult> {
    return {
      withinBand: true,
      reasoning: "[mock] no real CEFR judgment performed — heuristic checker is authoritative in demo mode.",
    };
  }
}
