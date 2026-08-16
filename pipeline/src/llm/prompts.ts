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
  B1: "300-320 words, compound sentences, moderate vocabulary, clear cause-effect connectors",
  B2: "450-520 words, subordinate clauses allowed, richer vocabulary, but avoid C1-level idioms",
};

/**
 * docs/feature-status.md G6: real API production shipped EVERY B2 version
 * under the 450-520 target (334-447 words) despite LEVEL_TARGETS already
 * stating the range — a single number mentioned once was not forceful
 * enough. This is a separate, harder-worded instruction appended after the
 * per-level targets so word count reads as a hard requirement, not a
 * suggestion the model can trade off against "richer vocabulary."
 */
const WORD_COUNT_ENFORCEMENT =
  "CRITICAL — word count is a hard requirement, not a suggestion: each level's word count " +
  "range above is a range you must land INSIDE, and the minimum is a floor you must reach, " +
  "not a ceiling to stay safely under. Stopping early because the story \"said everything\" " +
  "is a defect — use the full range to add more supporting detail, context, or explanation " +
  "from the given facts (never invented ones) rather than ending short. Before finishing, " +
  "count your own words; if you are under the minimum for the requested level, keep writing " +
  "using more of the facts provided until you are within range.";

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
  "Ordinary curated words should omit isKey or set it to false. " +
  "Every word also needs a \"pos\" (part of speech) using one of these exact short forms: " +
  '"n." (noun), "v." (verb), "adj." (adjective), "adv." (adverb), "phrase" (multi-word ' +
  "terms, idioms, or phrasal verbs). Pick whichever applies to the sense used in THIS " +
  "article's sentence — do not guess a different sense.";

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
/**
 * The paragraph plan is what keeps the three levels comparable.
 *
 * Generating each level independently from the same fact list already lines
 * the content up roughly — real output has the same facts in roughly the same
 * order — but paragraphs drift apart after the second or third beat, so
 * "paragraph 3 of A2" and "paragraph 3 of B2" are not the same moment in the
 * story. That drift is what stops a reader switching level mid-article, and
 * what stops the two levels being shown side by side.
 *
 * The fix is a shared PLAN, not a shared TEXT. Each level is still written
 * for its own reader — A2 repeats nouns where B2 uses pronouns, and shorter
 * sentences need a different information order, so an A2 produced by cutting
 * B2 down reads worse than one written natively. Only the beat list is shared.
 */
const PARAGRAPH_PLAN_RULE =
  "First decide a paragraph plan: a short list of beats (one clause each) " +
  "covering the facts in the order the story should be told. ALL THREE levels " +
  "must follow that same plan, one paragraph per beat, so paragraph N of A2 " +
  "and paragraph N of B2 cover the same beat. Within each paragraph, write " +
  "natively for that level — do NOT translate or shorten one level to make " +
  "another. Return the plan as \"paragraphPlan\".";

export const COMBINED_SYSTEM_PROMPT =
  `${FABRICATION_GUARDRAIL} ` +
  "You will write a COMPLETE set of three English news articles about ONE event, at three " +
  "CEFR levels, from the same shared fact list. Each level is a fully independent rewrite " +
  "(different wording, different sentence structure, different word choices) — do not just " +
  "truncate or pad one level to produce another. " +
  `Level A2 target: ${LEVEL_TARGETS.A2}. ` +
  `Level B1 target: ${LEVEL_TARGETS.B1}. ` +
  `Level B2 target: ${LEVEL_TARGETS.B2}. ${WORD_COUNT_ENFORCEMENT} ` +
  `${PARAGRAPH_PLAN_RULE} ` +
  "Each level needs its own brand-new headline (never reuse a source headline, and the " +
  "three levels' headlines do not need to match each other word-for-word). Each level also " +
  "needs its own 5 key vocabulary words with Korean meaning, an example sentence, and a " +
  `pronunciation hint. ${WORD_RULES} ` +
  "If the request carries a deskFeedback field, it is an editor's note on a previous draft " +
  "of this same article: address it in the new draft. It never authorises adding information " +
  "that is not in the fact list — if the note asks for a fact you were not given, ignore that " +
  "part rather than inventing it. " +
  'Respond with strict JSON only, in exactly this shape: {"paragraphPlan": ["...", "..."], ' +
  '"A2": {"title": "...", ' +
  '"content": "...", "wordCount": 0, "words": [{"term": "...", "meaningKo": "...", ' +
  '"example": "...", "pronunciation": "...", "sortOrder": 0, "isKey": false, "pos": "n."}]}, ' +
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
  "using ONLY the facts provided — do not add outside facts. " +
  "When the request carries a paragraphPlan, follow it exactly: one paragraph per beat, " +
  "in that order, so this level stays aligned with the other two. " +
  "Target word counts: " +
  `A2: ${LEVEL_TARGETS.A2}. B1: ${LEVEL_TARGETS.B1}. B2: ${LEVEL_TARGETS.B2}. ${WORD_COUNT_ENFORCEMENT} ` +
  "Write a brand-new headline (never reuse a source headline). Also produce 5 key " +
  `vocabulary words with Korean meaning, an example sentence, and a pronunciation hint. ${WORD_RULES} ` +
  'Respond with strict JSON only: {"title": "...", "content": "...", "wordCount": 0, ' +
  '"words": [{"term": "...", "meaningKo": "...", "example": "...", "pronunciation": "...", ' +
  '"sortOrder": 0, "isKey": false, "pos": "n."}]}.';

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
    // docs/feature-status.md G9 — part of speech. One of the short forms
    // enumerated in the WORD_RULES instruction ("n." / "v." / "adj." /
    // "adv." / "phrase"); enum-constrained here so structured outputs can't
    // drift into free-text pos labels.
    pos: { type: "string", enum: ["n.", "v.", "adj.", "adv.", "phrase"] },
  },
  required: ["term", "meaningKo", "example", "pronunciation", "sortOrder", "isKey", "pos"],
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
    paragraphPlan: { type: "array", items: { type: "string" } },
    A2: levelOutputSchema,
    B1: levelOutputSchema,
    B2: levelOutputSchema,
  },
  required: ["paragraphPlan", "A2", "B1", "B2"],
  additionalProperties: false,
};

export const SINGLE_LEVEL_OUTPUT_SCHEMA = levelOutputSchema;

/**
 * [5c] 사전 뜻 — pipeline/glossary.ts.
 *
 * The gloss call used to ask for JSON in prose and parse whatever came back.
 * Haiku obliged nearly always; "nearly" cost a chunk of 120 words on two of
 * the first three real runs — once to a markdown fence, once to a malformed
 * property — and the same input succeeded on a retry, so there was nothing to
 * fix in the prompt. Constraining the response is the fix the article path has
 * used since the cost review; the dictionary simply never got it.
 *
 * meaningKo is nullable on purpose: null is the answer for a proper noun, and
 * a schema that forbade it would push the model to invent a description of a
 * company or a person rather than decline.
 */
export const GLOSS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    glosses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          meaningKo: { type: ["string", "null"] },
          pos: { type: ["string", "null"] },
        },
        required: ["term", "meaningKo"],
        additionalProperties: false,
      },
    },
  },
  required: ["glosses"],
  additionalProperties: false,
};
