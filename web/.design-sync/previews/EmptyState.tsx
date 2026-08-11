import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ maxWidth: 420, padding: "var(--sp-5)", background: "var(--color-bg)" }}>{children}</div>
);

/** The default coffee state — no edition published yet. */
export const NoEditionYet = () => (
  <Frame>
    <EmptyState
      title="오늘의 브리핑을 준비하고 있어요."
      description="보통 아침 6시쯤 도착해요."
    />
  </Frame>
);

/** With an action button — the recoverable error shape. */
export const WithAction = () => (
  <Frame>
    <EmptyState
      emoji="📡"
      title="기사를 불러오지 못했어요."
      description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
      action={<Button variant="secondary">다시 불러오기</Button>}
    />
  </Frame>
);

/** Title only — the compact form used inside My Vocabulary sections. */
export const TitleOnly = () => (
  <Frame>
    <EmptyState emoji="📖" title="아직 저장한 단어가 없어요." />
  </Frame>
);
