/**
 * 시드 사전 채우기 — 커밋된 시드 기사에 대한 사전을 만든다.
 *
 * Run with: npm run glossary:seed -- [--dry]
 *
 * Different job from run-glossary.ts, which fills the dictionary a running
 * site reads out of the database. This one maintains a *fixture*: the seed
 * under web/src/lib/data/seed/ is what the reader falls back to with no
 * environment at all — a fresh clone, a preview build, every test render. Its
 * dictionary shipped empty because the seed had no way to get one, so on the
 * committed seed every uncurated word still opens an empty card while the
 * same word on the live site has a meaning.
 *
 * The glosses it writes are ordinary pipeline output — the same Haiku call,
 * the same prompt, the same proper-noun rule — for the same articles the seed
 * already ships. They are no more invented than the articles are.
 *
 * Re-run this after publishEdition writes new articles into the seed;
 * existing entries are kept, so it only ever buys what the new articles
 * introduced.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnthropicLLMProvider } from "../llm/anthropic.js";
import { MockLLMProvider } from "../llm/mock.js";
import { buildGlossary, collectTermsFromBodies, mayPersistGlosses } from "../pipeline/glossary.js";
import { estimateCostUsd } from "../llm/cost.js";
import type { LLMProvider } from "../llm/provider.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(HERE, "../../../web/src/lib/data/seed");
const VERSIONS_FILE = path.join(SEED_DIR, "article_versions.json");
const GLOSSES_FILE = path.join(SEED_DIR, "glosses.json");

/** Matches web/src/lib/types.ts Gloss, minus the term (which is the key). */
type SeedGlossFile = Record<string, { term: string; meaning_ko: string; pos: string | null }>;

function buildLLM(): LLMProvider {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";
  if (provider === "mock") return new MockLLMProvider();
  if (provider === "anthropic") return new AnthropicLLMProvider();
  throw new Error(`[seed-glossary] unknown LLM_PROVIDER "${provider}"`);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function main(): Promise<number> {
  const dryRun = process.argv.slice(2).includes("--dry");

  const versions = await readJson<Array<{ content?: string }>>(VERSIONS_FILE, []);
  const bodies = versions.map((v) => v.content ?? "").filter((c) => c.length > 0);
  if (bodies.length === 0) {
    console.error(`[seed-glossary] ${VERSIONS_FILE} 에서 본문을 찾지 못했습니다.`);
    return 1;
  }

  const terms = collectTermsFromBodies(bodies);
  // Same reasoning as run-glossary.ts: English prose cannot yield no words, so
  // an empty term list is a broken read, not an empty seed.
  if (terms.length === 0) {
    console.error(`[seed-glossary] 본문 ${bodies.length}개에서 단어가 나오지 않았습니다. 중단합니다.`);
    return 1;
  }

  const existing = await readJson<SeedGlossFile>(GLOSSES_FILE, {});
  const known = new Set(Object.keys(existing));
  const missing = terms.filter((t) => !known.has(t));
  console.log(
    `[seed-glossary] 본문 ${bodies.length}개, 단어 ${terms.length}개 ` +
      `(이미 있는 뜻 ${terms.length - missing.length}개, 새로 만들 것 ${missing.length}개)`,
  );

  if (dryRun) {
    const estimate = estimateCostUsd(
      {
        inputTokens: missing.length * 3,
        outputTokens: missing.length * 25,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      "haiku",
      "standard",
    );
    console.log(`[seed-glossary] --dry: 호출하지 않았습니다. 예상 비용 약 $${estimate.toFixed(4)} (추정치)`);
    return 0;
  }

  const llm = buildLLM();
  const result = await buildGlossary({ terms, known, llm, log: (m) => console.log(m) });
  if (!mayPersistGlosses(llm)) {
    console.log(
      `[seed-glossary] ${result.entries.length}개를 만들었지만 쓰지 않았습니다 — ` +
        `${llm.name} 제공자의 뜻은 커밋되는 시드에 남을 수 없습니다.`,
    );
    return 0;
  }

  // Existing entries win, for the same reason the database upsert ignores
  // duplicates: a meaning a reader has already seen does not change under them.
  const merged: SeedGlossFile = { ...existing };
  for (const entry of result.entries) {
    if (!merged[entry.term]) {
      merged[entry.term] = { term: entry.term, meaning_ko: entry.meaningKo, pos: entry.pos ?? null };
    }
  }
  // Sorted so a re-run produces a reviewable diff rather than a reshuffled file.
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(GLOSSES_FILE, `${JSON.stringify(sorted, null, 2)}\n`, "utf-8");

  const cost = estimateCostUsd(result.usage, "haiku", "standard");
  console.log(
    `[seed-glossary] ${GLOSSES_FILE} 에 ${Object.keys(sorted).length}개 기록` +
      (result.failedChunks > 0 ? ` (실패한 묶음 ${result.failedChunks}개)` : "") +
      ` — 비용 약 $${cost.toFixed(4)}`,
  );
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error("[seed-glossary] 실패:", err);
    process.exitCode = 1;
  });
