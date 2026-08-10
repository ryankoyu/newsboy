import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "우리가 뉴스를 만드는 방법 · Newsboy",
  description: "Newsboy가 매일 아침 뉴스를 수집하고, 확인하고, 다시 쓰는 방법.",
};

/**
 * "우리가 뉴스를 만드는 방법" — enhancement-plan.md Batch 1 #1 (신뢰 전면화).
 *
 * Content is a plain-language restatement of docs/news-sourcing-strategy.md
 * §1-3 — only what the pipeline actually does. No invented claims, no
 * superlatives beyond what the source doc supports (CLAUDE.md rule 1):
 *   §1 수집: RSS/공개 API만, 특정 매체 의존 금지 -> "여러 매체에서 수집"
 *   §2 원칙 2: "2개 이상 독립 소스에서 일치하는 사실만 게재" -> "교차 확인"
 *   §2 원칙 1: "표현 완전 재작성" -> "레벨별로 새로 씀, 원문 복제 아님"
 *   §3 출처 표기: 하단 링크 + 사람 검수 흐름 (design-decisions/파이프라인
 *   문서상 승인 이후 published) -> "사람 검수 후 발행"
 */
export default function AboutPage() {
  return (
    <main
      style={{
        maxWidth: "var(--content-max)",
        margin: "0 auto",
        padding: "var(--sp-6) var(--sp-4) var(--sp-12)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h1)",
          color: "var(--color-text)",
          margin: "0 0 var(--sp-2)",
        }}
      >
        우리가 뉴스를 만드는 방법
      </h1>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-ui)",
          color: "var(--color-text-secondary)",
          margin: "0 0 var(--sp-8)",
          lineHeight: "var(--lh-ui)",
        }}
      >
        Newsboy의 모든 기사는 아래 네 단계를 거쳐 만들어집니다.
      </p>

      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-5)",
        }}
      >
        <StepCard
          num={1}
          emoji="📰"
          title="수집"
          body="여러 매체의 공개 뉴스(RSS·공개 API)에서 오늘의 사건을 모아요. 특정 한 매체에만 의존하지 않아요."
        />
        <StepCard
          num={2}
          emoji="🔎"
          title="교차 확인"
          body="2개 이상의 서로 다른 매체에서 같은 사실이 확인될 때만 기사에 담아요. 한 곳에서만 나온 내용은 신지 않거나, 확실하지 않다고 표시해요."
        />
        <StepCard
          num={3}
          emoji="✍️"
          title="레벨별 재작성"
          body="확인된 사실만 가지고 A2·B1·B2 세 단계 영어로 새로 써요. 원문 문장을 그대로 옮기지 않아요."
        />
        <StepCard
          num={4}
          emoji="✅"
          title="사람 검수 후 발행"
          body="사람이 검수한 뒤에만 발행돼요. 모든 기사 하단에는 참고한 원문 기사 링크를 그대로 남겨둬요."
        />
      </ol>

      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-sm)",
          color: "var(--color-text-muted)",
          margin: "var(--sp-8) 0 0",
          lineHeight: "var(--lh-sm)",
        }}
      >
        보도사진은 사용하지 않아요. 기사 하단에서 언제든 원문 기사 링크를 확인할 수 있어요.
      </p>
    </main>
  );
}

function StepCard({
  num,
  emoji,
  title,
  body,
}: {
  num: number;
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <li
      style={{
        display: "flex",
        gap: "var(--sp-4)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-card)",
        padding: "var(--sp-4)",
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: "var(--r-pill)",
          background: "var(--color-accent-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
        }}
      >
        {emoji}
      </span>
      <div>
        <h2
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-h3)",
            fontWeight: 700,
            color: "var(--color-text)",
            margin: "0 0 var(--sp-1)",
          }}
        >
          {num}. {title}
        </h2>
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-ui)",
            color: "var(--color-text-secondary)",
            margin: 0,
            lineHeight: "var(--lh-ui)",
          }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}
