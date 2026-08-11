import { ReadTimeMeta } from "@/components/ReadTimeMeta";

/** The range the reading-time estimate actually produces across A2–B2. */
export const Range = () => (
  <div style={{ display: "flex", gap: "var(--sp-4)", alignItems: "center", padding: "var(--sp-3)" }}>
    <ReadTimeMeta minutes={1} />
    <ReadTimeMeta minutes={2} />
    <ReadTimeMeta minutes={5} />
  </div>
);
