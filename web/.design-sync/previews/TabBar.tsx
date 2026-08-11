import { TabBar } from "@/components/AppNav";

/** The mobile bottom navigation. The preview shims next/navigation to report
 *  "/" as the pathname, so Home renders in its active state. */
export const Default = () => (
  <div style={{ position: "relative", minHeight: 180, background: "var(--color-bg)" }}>
    <TabBar />
  </div>
);
