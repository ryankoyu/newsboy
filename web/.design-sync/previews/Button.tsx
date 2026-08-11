import { Button } from "@/components/Button";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center", flexWrap: "wrap" }}>
    {children}
  </div>
);

/** The four variants side by side — the axis that most changes appearance. */
export const Variants = () => (
  <Row>
    <Button variant="primary">읽기 시작</Button>
    <Button variant="secondary">나중에</Button>
    <Button variant="ghost">건너뛰기</Button>
    <Button variant="danger">저장 취소</Button>
  </Row>
);

/** Disabled state — 45% opacity, not-allowed cursor. */
export const Disabled = () => (
  <Row>
    <Button variant="primary" disabled>
      읽기 시작
    </Button>
    <Button variant="secondary" disabled>
      나중에
    </Button>
  </Row>
);

/** Full-width primary — how the onboarding and article-end CTAs use it. */
export const FullWidth = () => (
  <div style={{ maxWidth: 360 }}>
    <Button variant="primary" style={{ width: "100%" }}>
      오늘의 브리핑 시작하기
    </Button>
  </div>
);
