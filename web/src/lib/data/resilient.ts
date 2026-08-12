import type { EditionWithArticles } from "@/lib/types";
import { dataProvider } from "@/lib/data";

/**
 * A reader-facing read that is allowed to come back empty, never to 500.
 *
 * Serving from Supabase bought a fragility the seed never had: the seed is
 * imported at build time and cannot fail, but a live query can — a network
 * blip, an expired key, a paused project. Uncaught, that takes down the home
 * page of a news site, and "500" tells a reader nothing and invites them to
 * stop coming back. An empty paper at least says the truth in the app's own
 * voice: today's brief is not here yet.
 *
 * Deliberately NOT applied to the article route: a reader who followed a
 * link to a specific story is better served by an error they can retry than
 * by a "not found" that says the story never existed.
 */
export async function getLatestEditionOrNull(): Promise<EditionWithArticles | null> {
  try {
    return await dataProvider.getLatestEdition();
  } catch (err) {
    // Logged, not swallowed — an operator reading the deployment logs needs
    // to see the difference between "no edition published" and "the database
    // is unreachable", which look identical on the page.
    console.error("[home] 최신 에디션을 읽지 못했습니다:", err);
    return null;
  }
}
