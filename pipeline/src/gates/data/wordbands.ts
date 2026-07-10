/**
 * Minimal CEFR word-frequency bands, used by the readability heuristic in
 * gates/cefr.ts.
 *
 * LIMITATION (must stay visible — see gates/cefr.ts header and the final
 * report to the user): this is a small, hand-curated list, NOT a real
 * frequency corpus (e.g. it is not English Vocabulary Profile / EVP data,
 * which is licensed). It captures roughly which everyday words are clearly
 * A2-level vs. which are advanced/low-frequency, and is only precise enough
 * to catch gross band violations (e.g. C1 academic vocabulary in an A2 text).
 * It will misjudge many borderline words. Do not treat its score as a
 * substitute for a real CEFR-checker API or human review.
 */

/** Small closed set of unmistakably basic (A1/A2) words — function words + everyday vocabulary. */
export const A2_CORE_WORDS = new Set(
  [
    "a", "about", "after", "again", "all", "also", "always", "an", "and", "another",
    "any", "are", "around", "as", "ask", "at", "back", "bad", "be", "because",
    "become", "been", "before", "began", "begin", "believe", "big", "bring",
    "but", "buy", "by", "call", "came", "can", "car", "change", "child",
    "children", "city", "come", "company", "could", "country", "day", "did",
    "different", "do", "does", "down", "each", "eat", "end", "even", "every",
    "family", "far", "few", "find", "first", "food", "for", "found", "friend",
    "from", "get", "give", "go", "good", "government", "great", "group", "grow",
    "had", "hand", "happen", "hard", "has", "have", "he", "help", "her", "here",
    "high", "him", "his", "home", "hope", "hour", "house", "how", "however",
    "i", "if", "important", "in", "increase", "into", "is", "it", "its",
    "job", "just", "keep", "kill", "kind", "know", "large", "last", "late",
    "later", "learn", "leave", "let", "life", "like", "line", "little", "live",
    "long", "look", "lose", "lot", "love", "made", "make", "man", "many",
    "may", "me", "mean", "might", "money", "month", "more", "most", "mother",
    "move", "much", "must", "my", "name", "need", "never", "new", "next",
    "night", "no", "not", "now", "number", "of", "off", "often", "old", "on",
    "once", "one", "only", "or", "other", "our", "out", "over", "own", "part",
    "party", "people", "place", "plan", "play", "point", "president", "problem",
    "program", "provide", "put", "question", "quite", "rather", "reach",
    "read", "really", "reason", "remember", "report", "result", "right",
    "run", "said", "same", "saw", "say", "school", "second", "see", "seem",
    "she", "should", "show", "since", "small", "so", "some", "someone",
    "something", "sometimes", "soon", "start", "state", "still", "stop",
    "story", "student", "study", "system", "take", "talk", "team", "tell",
    "than", "that", "the", "their", "them", "then", "there", "these", "they",
    "thing", "think", "this", "those", "though", "thought", "three", "through",
    "time", "to", "today", "together", "too", "took", "town", "try", "turn",
    "two", "understand", "until", "up", "use", "used", "very", "wait",
    "walk", "want", "war", "was", "watch", "water", "way", "we", "week",
    "well", "went", "were", "what", "when", "where", "which", "while", "who",
    "why", "will", "win", "with", "without", "woman", "work", "world",
    "would", "year", "years", "yes", "yet", "you", "your", "world", "job",
    "worker", "workers", "money", "team", "game", "goal", "score", "player",
    "match", "win", "won", "lost",
  ].map((w) => w.toLowerCase()),
);

/** Words that are clearly advanced (B2+/academic/literary) — used to detect drift upward. */
export const ADVANCED_MARKER_WORDS = new Set(
  [
    "candor", "hedged", "laid bare", "ineluctable", "verisimilitude",
    "notwithstanding", "concomitant", "exigency", "obfuscate", "perspicacious",
    "ubiquitous", "paradigm", "quintessential", "juxtaposition", "dichotomy",
    "corroborate", "ostensibly", "vis-a-vis", "erstwhile", "prescient",
    "unequivocally", "inextricably", "notoriously", "purportedly",
    "unprecedented", "multifaceted", "aforementioned", "notwithstanding",
    "heretofore", "notionally", "vindicate", "capitulate", "acquiesce",
    "nonchalant", "unfettered", "burgeoning", "auspicious", "cataclysmic",
    "vicissitudes", "circumlocution", "sanguine", "recalcitrant",
  ].map((w) => w.toLowerCase()),
);
