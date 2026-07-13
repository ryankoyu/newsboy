"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { CefrLevel } from "@/lib/types";
import type { ReadingScale, ThemePref } from "@/lib/session";
import { useSession } from "@/lib/useSession";
import { Segmented } from "@/components/Segmented";
import { LevelSwitcher } from "@/components/LevelSwitcher";

/**
 * Settings tab — level change / reading font size (S/M/L/XL) / theme.
 * All values persist via sessionStore (localStorage for now).
 */
export function SettingsView() {
  const { session, refresh, hydrated } = useSession();
  const theme = session.getTheme();

  // Keep <html data-theme> in sync when theme changes from this screen too.
  // Gated on hydration so the pre-hydration fallback value ("system")
  // doesn't wipe the attribute the head script already applied.
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme, hydrated]);

  return (
    <main
      style={{
        maxWidth: "var(--content-max)",
        margin: "0 auto",
        padding: "var(--sp-4)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h2)",
          margin: "var(--sp-2) 0 var(--sp-5)",
          color: "var(--color-text)",
        }}
      >
        Settings
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-6)" }}>
        <SettingBlock
          title="내 레벨"
          description="홈과 기사 뷰어의 기본 레벨이에요. 기사에서 언제든 바꿔볼 수 있어요."
        >
          <LevelSwitcher
            value={session.getLevel()}
            onChange={(lv: CefrLevel) => {
              session.setLevel(lv);
              refresh();
            }}
          />
        </SettingBlock>

        <SettingBlock
          title="본문 글자 크기"
          description="영어 본문에만 적용돼요."
        >
          <Segmented<ReadingScale>
            ariaLabel="본문 글자 크기"
            value={session.getFontSize()}
            onChange={(s) => {
              session.setFontSize(s);
              refresh();
            }}
            options={[
              { value: "S", label: "S" },
              { value: "M", label: "M" },
              { value: "L", label: "L" },
              { value: "XL", label: "XL" },
            ]}
          />
        </SettingBlock>

        <SettingBlock
          title="테마"
          description="다크 모드를 켜거나, 시스템 설정을 따라가요."
        >
          <Segmented<ThemePref>
            ariaLabel="테마"
            value={theme}
            onChange={(t) => {
              session.setTheme(t);
              refresh();
            }}
            options={[
              { value: "light", label: "라이트" },
              { value: "dark", label: "다크" },
              { value: "system", label: "시스템" },
            ]}
          />
        </SettingBlock>

        <SettingBlock title="신뢰">
          <Link
            href="/about"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-ui)",
              color: "var(--color-link)",
              textDecoration: "none",
            }}
          >
            우리가 뉴스를 만드는 방법 →
          </Link>
        </SettingBlock>

        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-sm)",
            color: "var(--color-text-muted)",
            margin: 0,
          }}
        >
          로그인은 준비 중이에요. 지금 설정과 저장 내역은 이 기기(브라우저)에만 보관됩니다.
        </p>
      </div>
    </main>
  );
}

function SettingBlock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--r-md)",
        padding: "var(--sp-4)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--fs-h3)",
          margin: "0 0 var(--sp-1)",
          color: "var(--color-text)",
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-sm)",
            color: "var(--color-text-secondary)",
            margin: "0 0 var(--sp-4)",
          }}
        >
          {description}
        </p>
      )}
      {children}
    </section>
  );
}
