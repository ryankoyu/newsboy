import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { article } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

// Only step 1 is reachable in a static render — steps 2 and 3 are behind the
// "다음" button, and that is also the only place `sampleArticle` is used. So a
// sampleArticle={null} cell would be pixel-identical to this one; it was
// dropped rather than shipped as a duplicate variant (see NOTES.md).

/** The 3-step first-run flow at step 1, seeded with a real sample article. */
export const WithSampleArticle = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 560 }}>
    <OnboardingFlow sampleArticle={article} />
  </div>
);
