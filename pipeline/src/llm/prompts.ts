/**
 * Shared, byte-stable prompt text for the rewrite/generation stage.
 *
 * Split into FIXED (system prompt — identical on every call, safe to cache)
 * and templated per-call content, per claude-api skill's prompt-caching
 * guidance: "render order is tools -> system -> messages... put stable
 * content first, volatile content after the last cache_control breakpoint."
 *
 * IMPORTANT: nothing in these constants may vary between calls (no
 * timestamps, no per-event data) — any byte difference invalidates the
 * cached prefix for every call after it (shared/prompt-caching.md).
 */

export const FABRICATION_GUARDRAIL =
  "You must not invent any fact, number, quote, or name that is not present in the " +
  "provided source material. If information is missing, omit it rather than guessing. " +
  "Never reproduce a source's exact sentences or structure — express everything in " +
  "entirely new wording.";

export const LEVEL_TARGETS: Record<"A2" | "B1" | "B2", string> = {
  A2: "150-180 words, short simple sentences, present/simple past tense, common vocabulary only",
  B1: "~300 words, compound sentences, moderate vocabulary, clear cause-effect connectors",
  B2: "450-520 words, subordinate clauses allowed, richer vocabulary, but avoid C1-level idioms",
};

const WORD_RULES =
  "CRITICAL: every word you select MUST actually appear in the article body you just wrote " +
  "for THAT level (exact word, or a simple inflected form — plural -s/-es, past -ed, " +
  'progressive -ing; multi-word terms like "lay off" must appear as that exact phrase). ' +
  "Do not pick a word that only appears in your notes, the source facts, or a different " +
  "level's version — a curated word the reader cannot find and click in the text is a " +
  "defect. If fewer than 5 in-text words are suitable, return fewer rather than inventing " +
  "one that isn't in the body. " +
  "CRITICAL — do not lose core information through vocabulary avoidance: simplifying for a " +
  "lower CEFR level must never mean dropping the load-bearing 'what' of who-did-what (e.g. " +
  "rewriting a semiconductor export story for A2 must still say semiconductors, not just " +
  "'products'). If a fact genuinely cannot be expressed without a word above that level's " +
  "normal vocabulary, KEEP that word in the text rather than deleting the information, and " +
  "mark it in `words` with \"isKey\": true (0-2 such words per level — only ones that are " +
  "both hard for that level AND essential to understanding the article; do not overuse). " +
  "Ordinary curated words should omit isKey or set it to false.";

/**
 * Fixed system prompt for the COMBINED (all-3-levels-in-one-call) generation
 * path. This exact string is sent on every generateAllLevels() call — the
 * schema/rules never change per-request, only the user-turn content (facts +
 * category) does.
 *
 * CACHING CAVEAT [문서]: this prompt is ~690 tokens (chars/4 estimate), but
 * the minimum cacheable prefix on claude-opus-4-8 is 4096 tokens
 * (claude-api skill, shared/prompt-caching.md table) — below that the
 * cache_control marker silently doesn't cache (no error, just
 * cache_creation_input_tokens: 0). So TODAY the marker is structural
 * future-proofing, not an active saving: if this fixed prefix later grows
 * past 4096 tokens (style guide, few-shot examples), caching kicks in with
 * zero code changes. We deliberately do NOT pad the prompt to reach the
 * threshold — inflating a prompt to force caching costs more quality risk
 * than the ~$0.003/call it would save at this size. Verify actual behavior
 * on the first real run via usage.cache_read_input_tokens.
 */
export const COMBINED_SYSTEM_PROMPT =
  `${FABRICATION_GUARDRAIL} ` +
  "You will write a COMPLETE set of three English news articles about ONE event, at three " +
  "CEFR levels, from the same shared fact list. Each level is a fully independent rewrite " +
  "(different wording, different sentence structure, different word choices) — do not just " +
  "truncate or pad one level to produce another. " +
  `Level A2 target: ${LEVEL_TARGETS.A2}. ` +
  `Level B1 target: ${LEVEL_TARGETS.B1}. ` +
  `Level B2 target: ${LEVEL_TARGETS.B2}. ` +
  "Each level needs its own brand-new headline (never reuse a source headline, and the " +
  "three levels' headlines do not need to match each other word-for-word). Each level also " +
  "needs its own 5 key vocabulary words with Korean meaning, an example sentence, and a " +
  `pronunciation hint. ${WORD_RULES} ` +
  'Respond with strict JSON only, in exactly this shape: {"A2": {"title": "...", ' +
  '"content": "...", "wordCount": 0, "words": [{"term": "...", "meaningKo": "...", ' +
  '"example": "...", "pronunciation": "...", "sortOrder": 0, "isKey": false}]}, ' +
  '"B1": {same shape as A2}, "B2": {same shape as A2}}. Top-level keys must be exactly ' +
  '"A2", "B1", "B2" — no other wrapping object, no markdown fences.';

/**
 * Fixed system prompt for the SINGLE-LEVEL retry path (gate-failure retry of
 * one level only). Also byte-stable across calls — the level name and
 * feedback text are in the user turn, not here, so this prefix caches too.
 */
export const SINGLE_LEVEL_SYSTEM_PROMPT =
  `${FABRICATION_GUARDRAIL} ` +
  "Write a completely new English news article at the CEFR level given in the request, " +
  "using ONLY the facts provided — do not add outside facts. Target word counts: " +
  `A2: ${LEVEL_TARGETS.A2}. B1: ${LEVEL_TARGETS.B1}. B2: ${LEVEL_TARGETS.B2}. ` +
  "Write a brand-new headline (never reuse a source headline). Also produce 5 key " +
  `vocabulary words with Korean meaning, an example sentence, and a pronunciation hint. ${WORD_RULES} ` +
  'Respond with strict JSON only: {"title": "...", "content": "...", "wordCount": 0, ' +
  '"words": [{"term": "...", "meaningKo": "...", "example": "...", "pronunciation": "...", ' +
  '"sortOrder": 0, "isKey": false}]}.';

/**
 * JSON schema for output_config.format (structured outputs) — combined path.
 * Kept in sync with the shape described in COMBINED_SYSTEM_PROMPT. Structured
 * outputs guarantee valid JSON so extractJson()'s defensive fence-stripping
 * becomes a pure safety net rather than the primary parse path.
 */
const wordEntrySchema = {
  type: "object",
  properties: {
    term: { type: "string" },
    meaningKo: { type: "string" },
    example: { type: "string" },
    pronunciation: { type: "string" },
    sortOrder: { type: "integer" },
    isKey: { type: "boolean" },
  },
  required: ["term", "meaningKo", "example", "pronunciation", "sortOrder", "isKey"],
  additionalProperties: false,
};

const levelOutputSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    content: { type: "string" },
    wordCount: { type: "integer" },
    words: { type: "array", items: wordEntrySchema },
  },
  required: ["title", "content", "wordCount", "words"],
  additionalProperties: false,
};

export const COMBINED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    A2: levelOutputSchema,
    B1: levelOutputSchema,
    B2: levelOutputSchema,
  },
  required: ["A2", "B1", "B2"],
  additionalProperties: false,
};

export const SINGLE_LEVEL_OUTPUT_SCHEMA = levelOutputSchema;
