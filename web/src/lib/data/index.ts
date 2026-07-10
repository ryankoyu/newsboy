/**
 * Data layer entry point. Currently wired to the seed (mock) provider.
 * Swap this export for a Supabase-backed provider when the pipeline team's
 * data is live — call sites should only ever import from here.
 */
export { seedDataProvider as dataProvider } from "@/lib/data/seed-provider";
export type { DataProvider } from "@/lib/data/provider";
export { estimateReadingMinutes } from "@/lib/data/provider";
