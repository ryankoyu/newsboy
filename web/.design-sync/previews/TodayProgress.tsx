import { TodayProgress } from "@/components/TodayProgress";

const Bar = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "var(--sp-3)",
      padding: "var(--sp-3) var(--sp-4)",
      background: "var(--color-surface)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--r-md)",
      fontFamily: "var(--font-ui)",
      fontSize: "var(--fs-ui)",
      color: "var(--color-text)",
      maxWidth: 320,
    }}
  >
    {children}
  </div>
);

/** In place — the quiet counter sitting in the article viewer header. */
export const InViewerHeader = () => (
  <Bar>
    <span>오늘의 브리핑</span>
    <TodayProgress readCount={3} total={10} />
  </Bar>
);

/** Start, mid, and complete. */
export const Progression = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
    <Bar>
      <span>시작 전</span>
      <TodayProgress readCount={0} total={10} />
    </Bar>
    <Bar>
      <span>읽는 중</span>
      <TodayProgress readCount={6} total={10} />
    </Bar>
    <Bar>
      <span>완독</span>
      <TodayProgress readCount={10} total={10} />
    </Bar>
  </div>
);
