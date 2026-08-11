/**
 * Reading JSON back out of a model response.
 *
 * Some calls state their shape through a schema (output_config.format) and
 * come back clean. Others — judgeSameEvent, selectTop10 — only ask for JSON
 * in the system prompt, and a prompt is a request, not a guarantee. Those
 * replies arrive fenced in ```json, or as a correct object with a sentence of
 * commentary after it. Both are parsed here rather than at each call site.
 */

/**
 * The first complete JSON value in `text`, or null if there is none.
 *
 * Tracks bracket depth while skipping string literals, so a brace inside a
 * quoted headline ("Gaza talks resume {sic}") does not close the object early.
 */
export function firstJsonValue(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse a model reply as JSON, tolerating a code fence around it or prose
 * after it.
 *
 * A trailing sentence is what killed the 2026-08-11 run: Haiku answered
 * `{"sameEvent": false}` and then explained itself, JSON.parse threw
 * "Unexpected non-whitespace character after JSON at position 22", and eleven
 * minutes of clustering plus $0.24 of tokens went in the bin. Throws the
 * original parse error when there is no JSON value to be found — a reply that
 * is genuinely not JSON should still fail loudly.
 */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();

  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    const value = firstJsonValue(raw);
    if (value === null) throw err;
    return JSON.parse(value) as T;
  }
}
