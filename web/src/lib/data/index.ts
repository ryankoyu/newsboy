import type { DataProvider } from "@/lib/data/provider";
import { seedDataProvider } from "@/lib/data/seed-provider";
import { createSupabaseDataProvider } from "@/lib/data/supabase-provider";

/**
 * Data layer entry point — call sites import only from here.
 *
 * Supabase when it is configured, the committed seed otherwise. The seed is
 * not a mock to be deleted later: it is what keeps the reader working with
 * no environment at all, so a fresh clone, a preview build, and every test
 * render real articles without credentials. The fallback is the reason
 * `npm run dev` needs no setup.
 *
 * Both variables must be present. Configuring one of the two is a
 * half-finished deployment, and silently serving month-old seed articles
 * from a site that looks live is worse than either outcome — so say so
 * once, loudly, at startup.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function resolveProvider(): DataProvider {
  if (url && anonKey) return createSupabaseDataProvider(url, anonKey);

  if (url || anonKey) {
    console.warn(
      "[data] NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_ANON_KEY 중 " +
        "하나만 설정돼 있어 시드 데이터로 되돌립니다 — 이 사이트는 라이브 " +
        "기사가 아니라 저장된 예시를 보여주고 있습니다."
    );
  }
  return seedDataProvider;
}

export const dataProvider: DataProvider = resolveProvider();

/** Which source the reader is actually being served from — for /about and diagnostics. */
export const dataSource: "supabase" | "seed" = url && anonKey ? "supabase" : "seed";

export type { DataProvider } from "@/lib/data/provider";
export { estimateReadingMinutes } from "@/lib/data/provider";
