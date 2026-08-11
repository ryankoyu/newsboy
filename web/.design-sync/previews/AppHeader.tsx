import { AppHeader } from "@/components/AppHeader";

/** The desktop header — wordmark on the left, theme toggle on the right. */
export const Default = () => (
  <div style={{ background: "var(--color-bg)", minHeight: 120 }}>
    <AppHeader />
  </div>
);

/** Over page content, so the header's border and background read correctly. */
export const OverContent = () => (
  <div style={{ background: "var(--color-bg)" }}>
    <AppHeader />
    <div style={{ padding: "var(--sp-5)" }}>
      <h2
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h2)",
          margin: 0,
          color: "var(--color-text)",
        }}
      >
        오늘의 브리핑
      </h2>
    </div>
  </div>
);
