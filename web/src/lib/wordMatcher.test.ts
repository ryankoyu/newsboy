import { describe, it, expect } from "vitest";
import type { Word } from "@/lib/types";
import {
  tokenizeSentence,
  normalizeApostrophes,
  lookupKey,
  stripParenthetical,
  conservativeInflections,
  buildWordSequences,
  tokenMatches,
  findMatchedRuns,
} from "@/lib/wordMatcher";

function makeWord(term: string, overrides: Partial<Word> = {}): Word {
  return {
    id: `word-${term}`,
    version_id: "v1",
    term,
    meaning_ko: "뜻",
    example: null,
    pronunciation: null,
    sort_order: 0,
    ...overrides,
  };
}

describe("tokenizeSentence", () => {
  it("splits words and punctuation/whitespace into separate tokens", () => {
    const tokens = tokenizeSentence("Meta had to lay off workers.");
    expect(tokens.map((t) => t.text)).toEqual([
      "Meta", " ", "had", " ", "to", " ", "lay", " ", "off", " ", "workers", ".",
    ]);
    expect(tokens.map((t) => t.isWord)).toEqual([
      true, false, true, false, true, false, true, false, true, false, true, false,
    ]);
  });

  it("keeps hyphenated words as one token", () => {
    const tokens = tokenizeSentence("a well-known fact");
    const words = tokens.filter((t) => t.isWord).map((t) => t.text);
    expect(words).toEqual(["a", "well-known", "fact"]);
  });

  it("keeps apostrophe-containing words as one token (straight and curly)", () => {
    const straight = tokenizeSentence("Zuckerberg's plan");
    const curly = tokenizeSentence("Zuckerberg’s plan");
    expect(straight.filter((t) => t.isWord).map((t) => t.text)).toEqual([
      "Zuckerberg's",
      "plan",
    ]);
    expect(curly.filter((t) => t.isWord).map((t) => t.text)).toEqual([
      "Zuckerberg’s",
      "plan",
    ]);
  });
});

describe("normalizeApostrophes / lookupKey", () => {
  it("normalizes curly quotes to straight quotes", () => {
    expect(normalizeApostrophes("Zuckerberg’s")).toBe("Zuckerberg's");
    expect(normalizeApostrophes("Zuckerberg‘s")).toBe("Zuckerberg's");
    expect(normalizeApostrophes("Zuckerbergʼs")).toBe("Zuckerberg's");
  });

  it("lookupKey lowercases and normalizes apostrophes", () => {
    expect(lookupKey("Zuckerberg’S")).toBe("zuckerberg's");
    expect(lookupKey("WORKFORCE")).toBe("workforce");
  });
});

describe("stripParenthetical", () => {
  it("strips a trailing POS hint", () => {
    expect(stripParenthetical("upset (n.)")).toBe("upset");
  });

  it("leaves terms without parentheticals untouched", () => {
    expect(stripParenthetical("workforce")).toBe("workforce");
  });
});

describe("conservativeInflections", () => {
  it("adds plural -s for regular nouns", () => {
    expect(conservativeInflections("worker").has("workers")).toBe(true);
  });

  it("adds -es for words ending in s/x/z/ch/sh", () => {
    expect(conservativeInflections("box").has("boxes")).toBe(true);
    expect(conservativeInflections("watch").has("watches")).toBe(true);
  });

  it("handles consonant + y -> ies", () => {
    expect(conservativeInflections("study").has("studies")).toBe(true);
    expect(conservativeInflections("study").has("studied")).toBe(true);
    expect(conservativeInflections("study").has("studying")).toBe(true);
  });

  it("handles final -e drop before -ing/-ed (hope/hoping/hoped)", () => {
    const forms = conservativeInflections("hope");
    expect(forms.has("hoped")).toBe(true);
    expect(forms.has("hoping")).toBe(true);
  });

  it("doubles a short final consonant (stun -> stunned/stunning)", () => {
    const forms = conservativeInflections("stun");
    expect(forms.has("stunned")).toBe(true);
    expect(forms.has("stunning")).toBe(true);
  });

  it("adds plain -ed/-ing for regular verbs", () => {
    const forms = conservativeInflections("reassign");
    expect(forms.has("reassigned")).toBe(true);
    expect(forms.has("reassigning")).toBe(true);
  });

  it("does NOT cover irregular forms (lay -> laid is absent)", () => {
    const forms = conservativeInflections("lay");
    expect(forms.has("laid")).toBe(false);
  });

  it("always includes the base form itself", () => {
    expect(conservativeInflections("workforce").has("workforce")).toBe(true);
  });
});

describe("tokenMatches", () => {
  it("matches exact tokens", () => {
    expect(tokenMatches("workforce", "workforce")).toBe(true);
  });

  it("matches conservative inflections", () => {
    expect(tokenMatches("workers", "worker")).toBe(true);
    expect(tokenMatches("stunned", "stun")).toBe(true);
  });

  it("does not match unrelated words", () => {
    expect(tokenMatches("banana", "workforce")).toBe(false);
  });
});

describe("buildWordSequences", () => {
  it("splits a multi-word term into normalized token sequences", () => {
    const seqs = buildWordSequences([makeWord("lay off")]);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].tokens).toEqual(["lay", "off"]);
  });

  it("strips parentheticals before tokenizing", () => {
    const seqs = buildWordSequences([makeWord("upset (n.)")]);
    expect(seqs[0].tokens).toEqual(["upset"]);
  });
});

describe("findMatchedRuns — sequence & false-positive behavior", () => {
  it("matches a multi-word sequence ('lay off') as a single run", () => {
    const words = [makeWord("lay off")];
    const sequences = buildWordSequences(words);
    const tokens = tokenizeSentence("The factory had to lay off workers.");
    const runs = findMatchedRuns(tokens, sequences);

    expect(runs).toHaveLength(1);
    const run = runs[0];
    const matchedText = tokens
      .slice(run.startIdx, run.endIdx + 1)
      .map((t) => t.text)
      .join("");
    expect(matchedText).toBe("lay off");
    expect(run.entry.term).toBe("lay off");
  });

  it("matches 'lay off' across extra whitespace between the two words", () => {
    const sequences = buildWordSequences([makeWord("lay off")]);
    const tokens = tokenizeSentence("They will lay   off many workers.");
    const runs = findMatchedRuns(tokens, sequences);
    expect(runs).toHaveLength(1);
  });

  it("matches curly apostrophe body text against a straight-apostrophe term", () => {
    const sequences = buildWordSequences([makeWord("Zuckerberg's")]);
    const tokens = tokenizeSentence("Zuckerberg’s plan failed.");
    const runs = findMatchedRuns(tokens, sequences);
    expect(runs).toHaveLength(1);
    expect(runs[0].entry.term).toBe("Zuckerberg's");
  });

  it("matches case-insensitively", () => {
    const sequences = buildWordSequences([makeWord("workforce")]);
    const tokens = tokenizeSentence("The WORKFORCE was reduced.");
    const runs = findMatchedRuns(tokens, sequences);
    expect(runs).toHaveLength(1);
  });

  it("matches conservative inflected forms in running text (-s/-ed/-ing)", () => {
    const sequences = buildWordSequences([
      makeWord("stun"),
      makeWord("reassign"),
      makeWord("workforce"),
    ]);

    const plural = findMatchedRuns(tokenizeSentence("the workforces shrank"), sequences);
    // "workforces" -> plural of "workforce" is "workforces" (ends in e -> +s)
    expect(plural.some((r) => r.entry.term === "workforce")).toBe(true);

    const past = findMatchedRuns(tokenizeSentence("fans were stunned by the result"), sequences);
    expect(past.some((r) => r.entry.term === "stun")).toBe(true);

    const ing = findMatchedRuns(tokenizeSentence("workers are being reassigned"), sequences);
    expect(ing.some((r) => r.entry.term === "reassign")).toBe(true);
  });

  it("does NOT mis-match 'sing' as a false hit for a curated word 's'", () => {
    // Guards against naive substring/prefix matching splitting "sing" into
    // "s" + "ing". No real curated term is a single letter, but this proves
    // findMatchedRuns only matches whole word-tokens, never substrings.
    const sequences = buildWordSequences([makeWord("s")]);
    const tokens = tokenizeSentence("They sing a song.");
    const runs = findMatchedRuns(tokens, sequences);
    expect(runs).toHaveLength(0);
  });

  it("does not false-match a short curated word against an unrelated longer word", () => {
    // "era" should not match inside "generate" or similar — whole-token only.
    const sequences = buildWordSequences([makeWord("era")]);
    const tokens = tokenizeSentence("They wanted to generate a new plan.");
    const runs = findMatchedRuns(tokens, sequences);
    expect(runs).toHaveLength(0);
  });

  it("prefers the longer multi-word sequence over a shorter single-word entry at the same position", () => {
    const sequences = buildWordSequences([makeWord("lay off"), makeWord("lay")]);
    const tokens = tokenizeSentence("They lay off staff every year.");
    const runs = findMatchedRuns(tokens, sequences);
    expect(runs).toHaveLength(1);
    expect(runs[0].entry.term).toBe("lay off");
  });

  it("returns no runs when no curated words are present", () => {
    const sequences = buildWordSequences([makeWord("workforce")]);
    const tokens = tokenizeSentence("Nothing relevant here at all.");
    expect(findMatchedRuns(tokens, sequences)).toHaveLength(0);
  });
});
