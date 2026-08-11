import { AppShell } from "@/components/AppShell";
import { HomeView } from "@/components/HomeView";
import { edition } from "../fixtures/seed";
import { resetSession } from "../fixtures/session";

// Preview cards share one origin, so localStorage carries between them.
// Reset it here so this card always renders a pristine first-run account.
resetSession();

/** The shell wrapping real content — header, side nav (desktop), tab bar
 *  (mobile) and the centred content column. */
export const WithHomeContent = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 640 }}>
    <AppShell>
      <HomeView edition={edition} />
    </AppShell>
  </div>
);

/** The chrome on its own, so the layout frame is readable without content. */
export const ChromeOnly = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 420 }}>
    <AppShell>
      <div style={{ padding: "var(--sp-5)" }}>
        <h2
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-h2)",
            margin: 0,
            color: "var(--color-text)",
          }}
        >
          페이지 내용이 이 자리에 들어갑니다
        </h2>
      </div>
    </AppShell>
  </div>
);
