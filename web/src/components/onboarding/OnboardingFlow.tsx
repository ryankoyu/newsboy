"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ArticleWithDetails, CefrLevel } from "@/lib/types";
import { useSession } from "@/lib/useSession";
import { Button } from "@/components/Button";
import { LevelBadge } from "@/components/LevelBadge";
import { ProgressDots } from "@/components/onboarding/ProgressDots";

/**
 * Onboarding — a3-ui-ux.md §2-4. Three steps:
 *   1. Start  2. Level self-diagnosis  3. Done
 *
 * DEVIATION (auth out of scope this phase, coordinator instruction):
 * Step 1 has no Google/email sign-in buttons — rendering fake social-login
 * buttons that don't authenticate would be dishonest UI. Instead: optional
 * display-name input + "시작하기". "먼저 둘러보기" (§2-5 비로그인 진입) skips
 * straight through with the A2 default.
 *
 * Level samples reuse the seed article's real A2/B1/B2 versions
 * (first 2 sentences each) — no invented sentences (CLAUDE.md rule 1,
 * a3 §2-4 "실제 제작된 기사 하나의 3레벨 버전을 재사용").
 */

const LEVELS: CefrLevel[] = ["A2", "B1", "B2"];

const LEVEL_FEEL_LABEL: Record<CefrLevel, string> = {
  A2: "쉽게 읽혀요",
  B1: "적당해요",
  B2: "술술 읽혀요",
};

export function OnboardingFlow({
  sampleArticle,
}: {
  sampleArticle: ArticleWithDetails | null;
}) {
  const router = useRouter();
  const { session } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<CefrLevel | null>(null);

  // First 2 sentences of each level version of the same story (§2-4 spec).
  const samples = useMemo(() => {
    if (!sampleArticle) return null;
    const byLevel: Partial<Record<CefrLevel, string>> = {};
    for (const lv of LEVELS) {
      const v = sampleArticle.versions.find((x) => x.level === lv);
      if (v) byLevel[lv] = v.sentences.slice(0, 2).join(" ");
    }
    return LEVELS.every((lv) => byLevel[lv]) ? (byLevel as Record<CefrLevel, string>) : null;
  }, [sampleArticle]);

  function finish(level: CefrLevel) {
    session.setLevel(level);
    if (name.trim()) session.setDisplayName(name.trim());
    session.setOnboarded(true);
    setPicked(level);
    setStep(3);
  }

  function skipAll() {
    // "먼저 둘러보기" — guest entry, session default A2 (§2-5).
    session.setOnboarded(true);
    router.replace("/");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--color-bg)",
        display: "flex",
        justifyContent: "center",
        padding: "var(--sp-8) var(--sp-4)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        {/* Step 1 — Start */}
        {step === 1 && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 40, margin: "var(--sp-8) 0 var(--sp-2)" }} aria-hidden>
              ☕
            </p>
            <h1
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-display)",
                margin: "0 0 var(--sp-1)",
                color: "var(--color-text)",
              }}
            >
              Newsboy
            </h1>
            <p
              lang="en"
              style={{
                fontFamily: "var(--font-en)",
                fontSize: "var(--fs-ui)",
                color: "var(--color-text-secondary)",
                margin: "0 0 var(--sp-6)",
              }}
            >
              Today&rsquo;s News. Your English.
            </p>

            <ProgressDots step={1} />

            <div style={{ marginTop: "var(--sp-8)", textAlign: "left" }}>
              <label
                htmlFor="onboarding-name"
                style={{
                  display: "block",
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-ui)",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  marginBottom: "var(--sp-2)",
                }}
              >
                이름 (선택)
              </label>
              <input
                id="onboarding-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="브리핑에서 부를 이름"
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: "var(--r-sm)",
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-ui)",
                  padding: "0 var(--sp-4)",
                }}
              />
              <p
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-sm)",
                  color: "var(--color-text-muted)",
                  margin: "var(--sp-2) 0 0",
                }}
              >
                계정 가입(로그인)은 추후 제공 예정이에요. 지금 설정은 이 기기에만 저장됩니다.
              </p>
            </div>

            <div style={{ marginTop: "var(--sp-6)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <Button variant="primary" style={{ width: "100%" }} onClick={() => setStep(2)}>
                시작하기
              </Button>
              <Button variant="ghost" onClick={skipAll}>
                나중에 · 먼저 둘러보기
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 — Level self-diagnosis */}
        {step === 2 && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "var(--sp-6)",
              }}
            >
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="뒤로"
                style={{
                  background: "transparent",
                  border: "none",
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-ui)",
                  color: "var(--color-text-secondary)",
                  padding: "var(--sp-2)",
                }}
              >
                ← 뒤로
              </button>
              <ProgressDots step={2} />
            </div>

            <h1
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-h2)",
                margin: "0 0 var(--sp-1)",
                color: "var(--color-text)",
              }}
            >
              어느 쪽이 편하게 읽히나요?
            </h1>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                color: "var(--color-text-secondary)",
                margin: "0 0 var(--sp-5)",
              }}
            >
              가장 자연스러운 걸 고르세요.
            </p>

            {samples ? (
              <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
                <legend className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                  레벨 샘플 선택
                </legend>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
                  {LEVELS.map((lv) => {
                    const selected = picked === lv;
                    return (
                      <label
                        key={lv}
                        style={{
                          display: "block",
                          background: "var(--color-surface)",
                          border: selected
                            ? "2px solid var(--color-accent)"
                            : "1px solid var(--color-border)",
                          borderRadius: "var(--r-md)",
                          padding: "var(--sp-4)",
                          boxShadow: "var(--shadow-card)",
                          cursor: "pointer",
                        }}
                      >
                        <p
                          lang="en"
                          style={{
                            fontFamily: "var(--font-en)",
                            fontSize: "var(--fs-ui)",
                            lineHeight: 1.6,
                            color: "var(--color-text)",
                            margin: "0 0 var(--sp-3)",
                          }}
                        >
                          {samples[lv]}
                        </p>
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-end",
                            gap: "var(--sp-2)",
                            fontFamily: "var(--font-ui)",
                            fontSize: "var(--fs-sm)",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {LEVEL_FEEL_LABEL[lv]}
                          <input
                            type="radio"
                            name="level-sample"
                            value={lv}
                            checked={selected}
                            onChange={() => setPicked(lv)}
                            style={{ width: 18, height: 18, accentColor: "var(--color-accent)" }}
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <p
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--fs-ui)",
                  color: "var(--color-text-secondary)",
                }}
              >
                샘플 기사를 불러오지 못했어요. 아래에서 A2로 시작할 수 있어요.
              </p>
            )}

            <div style={{ marginTop: "var(--sp-6)", display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
              <Button
                variant="primary"
                style={{ width: "100%" }}
                disabled={!picked}
                onClick={() => picked && finish(picked)}
              >
                이걸로 시작하기
              </Button>
              <Button variant="ghost" onClick={() => finish("A2")}>
                잘 모르겠어요 → A2로 시작
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Done */}
        {step === 3 && picked && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: 44, margin: "var(--sp-10) 0 var(--sp-4)" }} aria-hidden>
              ✅
            </p>
            <h1
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-display)",
                margin: "0 0 var(--sp-3)",
                color: "var(--color-text)",
              }}
            >
              준비됐어요{name.trim() ? `, ${name.trim()}` : ""}!
            </h1>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                color: "var(--color-text)",
                margin: "0 0 var(--sp-5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--sp-2)",
              }}
            >
              당신의 레벨: <LevelBadge level={picked} />
            </p>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-ui)",
                color: "var(--color-text-secondary)",
                margin: "0 0 var(--sp-2)",
              }}
            >
              매일 아침 오늘의 뉴스 10개를 {picked} 영어로 브리핑해 드릴게요.
            </p>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: "var(--fs-sm)",
                color: "var(--color-text-muted)",
                margin: "0 0 var(--sp-8)",
              }}
            >
              언제든 기사에서 다른 레벨로 바꿔볼 수 있어요.
            </p>
            <Button variant="primary" style={{ width: "100%" }} onClick={() => router.replace("/")}>
              오늘의 브리핑 보기 →
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
