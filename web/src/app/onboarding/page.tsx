import { dataProvider } from "@/lib/data";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

/**
 * Onboarding route — a3-ui-ux.md §2-4.
 * The level self-diagnosis samples reuse the first article of the latest
 * edition (real 3-level content — no invented sentences).
 */
export default async function OnboardingPage() {
  const edition = await dataProvider.getLatestEdition();
  const sampleArticle = edition?.articles[0] ?? null;
  return <OnboardingFlow sampleArticle={sampleArticle} />;
}
