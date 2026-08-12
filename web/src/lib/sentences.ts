/**
 * Naive sentence splitter matching the display convention baked into the
 * seed (ArticleBody renders one paragraph per `sentences[]` entry). No
 * abbreviation handling — acceptable because the CEFR gate already pushes
 * rewrites toward short, simple sentences. Paragraph breaks are treated as
 * sentence boundaries too (normalized to whitespace before splitting),
 * matching seed data, which has no paragraph concept at all.
 *
 * Lives here rather than in lib/admin because both paths into the reader
 * need it: the desk's seed transform, and the Supabase provider, which gets
 * `content` as one TEXT column and has to split it at read time (A2 §3-2).
 * Two copies of this would mean the same article breaks into different
 * sentences depending on which path served it — and sentence index is what
 * a saved sentence is keyed on.
 */
export function splitSentences(text: string): string[] {
  const normalized = text.replace(/\s*\n+\s*/g, " ").trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [normalized];
  return matches.map((s) => s.trim()).filter(Boolean);
}
