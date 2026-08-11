"use client";

import Link from "next/link";
import type { CefrLevel } from "@/lib/types";
import type { ReadingScale, ThemePref } from "@/lib/session";
import { useSession } from "@/lib/useSession";
import { Segmented } from "@/components/Segmented";
import { LevelSwitcher } from "@/components/LevelSwitcher";
import { NewsprintTabBar } from "@/components/newsprint/NewsprintTabBar";
import { FolioLine, Nameplate } from "@/components/newsprint/chrome";

/**
 * Settings, newsprint skin.
 *
 * The handoff does not design this screen ("Known gaps"), but it is one of
 * the three tab destinations, so leaving it on the standard skin puts a
 * cream-and-rounded page one tap from the paper. It is rebuilt here from the
 * handoff's own vocabulary — ruled boxes, uppercase sideheads, hairlines —
 * with no new visual ideas invented.
 *
 * The controls themselves stay exactly as they are: Segmented and
 * LevelSwitcher are app components, and the handoff's boundary keeps app
 * components on Newsboy's rules rather than restyling them as paper.
 */

const DISPLAY = "var(--font-display), Georgia, serif";

export function NewsprintSettingsView() {
  const { session, refresh } = useSession();
  const level = session.getLevel();
  const fontSize = session.getFontSize();
  const theme = session.getTheme();

  return (
    <div style={{ display: "flex", justifyContent: "center", background: "var(--paper-desk)" }}>
      <div
        className="np-paper"
        style={{
          width: 430,
          maxWidth: "100%",
          minHeight: "100vh",
          padding: "0 16px 96px",
          position: "relative",
        }}
      >
        <header style={{ textAlign: "center", padding: "18px 2px 10px" }}>
          <div style={{ display: "inline-block" }}>
            <Nameplate size={24} />
          </div>
        </header>

        <div style={{ borderBottom: "3px double var(--rule-strong)", paddingBottom: 6 }}>
          <FolioLine dateLabel="The Reader's Desk" right="Settings" bordered />
        </div>

        <Group
          head="Reading Level"
          note="홈과 기사 뷰어의 기본 레벨이에요. 기사에서 언제든 바꿔볼 수 있어요."
        >
          <LevelSwitcher
            value={level}
            onChange={(next: CefrLevel) => {
              session.setLevel(next);
              refresh();
            }}
          />
        </Group>

        <Group head="Type Size" note="영어 본문에만 적용돼요.">
          <Segmented<ReadingScale>
            ariaLabel="본문 글자 크기"
            value={fontSize}
            onChange={(next) => {
              session.setFontSize(next);
              refresh();
            }}
            options={[
              { value: "S", label: "S" },
              { value: "M", label: "M" },
              { value: "L", label: "L" },
              { value: "XL", label: "XL" },
            ]}
          />
        </Group>

        <Group
          head="Theme"
          note="다크 모드에서는 신문 지면 대신 기본 화면으로 보여요 — 종이를 어둡게 뒤집지는 않아요."
        >
          <Segmented<ThemePref>
            ariaLabel="테마"
            value={theme}
            onChange={(next) => {
              session.setTheme(next);
              refresh();
            }}
            options={[
              { value: "light", label: "라이트" },
              { value: "dark", label: "다크" },
              { value: "system", label: "시스템" },
            ]}
          />
        </Group>

        <Group head="Provenance" note={null}>
          <Link
            href="/about"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 13,
              color: "var(--action)",
              textDecoration: "none",
            }}
          >
            우리가 뉴스를 만드는 방법 →
          </Link>
        </Group>

        <p
          style={{
            margin: "22px 0 0",
            paddingTop: 12,
            borderTop: "1px solid var(--rule-hair)",
            fontFamily: "var(--font-ui)",
            fontSize: 11.5,
            lineHeight: 1.6,
            color: "var(--ink-muted)",
          }}
        >
          로그인은 준비 중이에요. 지금 설정과 저장 내역은 이 기기(브라우저)에만 보관됩니다.
        </p>
      </div>

      <NewsprintTabBar />
    </div>
  );
}

/** One ruled setting group: uppercase sidehead, note, then the control. */
function Group({
  head,
  note,
  children,
}: {
  head: string;
  note: string | null;
  children: React.ReactNode;
}) {
  return (
    <section style={{ margin: "18px 0 0", border: "1px solid var(--rule)", padding: "12px 14px 14px" }}>
      <h2
        style={{
          margin: 0,
          fontFamily: DISPLAY,
          fontWeight: 800,
          fontStretch: "74%",
          fontSize: 13,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--ink-strong)",
          borderBottom: "1px solid var(--rule-hair)",
          paddingBottom: 6,
        }}
      >
        {head}
      </h2>
      {note && (
        <p
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--font-ui)",
            fontSize: 11.5,
            lineHeight: 1.55,
            color: "var(--ink-muted)",
          }}
        >
          {note}
        </p>
      )}
      <div style={{ marginTop: 11 }}>{children}</div>
    </section>
  );
}
