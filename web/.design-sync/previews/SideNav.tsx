import { SideNav } from "@/components/AppNav";

/** The desktop sidebar. next/navigation is shimmed to "/" in previews, so
 *  Home shows the active pill. */
export const Default = () => (
  <div style={{ display: "flex", minHeight: 320, background: "var(--color-bg)" }}>
    <SideNav />
  </div>
);
