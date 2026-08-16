import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * .env.example has to name the variables the code actually reads.
 *
 * It stopped doing that once already, and the failure was invisible. When the
 * reader moved onto Supabase it started reading NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, while the template still documented
 * SUPABASE_URL / SUPABASE_ANON_KEY and said in prose that "the web app
 * currently reads only local seed JSON". Anyone deploying by following it
 * would have set two names nothing reads — and the app does not fail when
 * both are missing. It serves the committed seed instead, so the site comes up
 * looking correct and shows month-old articles.
 *
 * A missing variable that errors is a support ticket. A missing variable that
 * silently serves stale content is a site nobody knows is broken, so this pair
 * is worth a test rather than a convention.
 */

const WEB_ROOT = path.resolve(__dirname, "../../..");

function envNamesInTemplate(): Set<string> {
  const text = readFileSync(path.join(WEB_ROOT, ".env.example"), "utf-8");
  return new Set([...text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
}

function envNamesInSource(): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const text = readFileSync(full, "utf-8");
      for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
    }
  };
  walk(path.join(WEB_ROOT, "src"));
  // Set by the runtime, not by an operator — nothing to document.
  names.delete("NODE_ENV");
  return names;
}

describe(".env.example", () => {
  it("documents every environment variable the code reads", () => {
    const missing = [...envNamesInSource()].filter((n) => !envNamesInTemplate().has(n)).sort();
    expect(missing, `read by src/ but absent from .env.example: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents nothing the code no longer reads", () => {
    // The other direction of the same failure: a name left behind after the
    // code moved on is an instruction to set something that does nothing.
    const stale = [...envNamesInTemplate()].filter((n) => !envNamesInSource().has(n)).sort();
    expect(stale, `in .env.example but read nowhere in src/: ${stale.join(", ")}`).toEqual([]);
  });

  it("keeps the reader's two variables together — one without the other falls back to the seed", () => {
    const template = envNamesInTemplate();
    expect(template.has("NEXT_PUBLIC_SUPABASE_URL")).toBe(true);
    expect(template.has("NEXT_PUBLIC_SUPABASE_ANON_KEY")).toBe(true);
  });
});
