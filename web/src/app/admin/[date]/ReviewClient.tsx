"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { CandidateReportEntry, CefrLevel, PipelineArticle, PipelineEdition } from "@/lib/admin/pipelineTypes";
import { ALL_CHECK_KINDS, checkBadgeState, deriveGateStatus, findCheck, type CheckBadgeState } from "@/lib/admin/gateStatus";
import {
  approveArticleAction,
  excludeArticleAction,
  publishEditionAction,
  resetArticleDecisionAction,
  setLeadArticleAction,
  approveAllPendingAction,
} from "../actions";

const CHECK_LABEL: Record<string, string> = {
  cefr: "CEFR",
  ngram_overlap: "n-gram",
  two_source: "2소스",
  word_match: "단어일치",
  word_count: "분량",
};

const BADGE_STYLE: Record<CheckBadgeState, { bg: string; fg: string; label: string }> = {
  pass: { bg: "var(--level-a2-bg)", fg: "var(--level-a2-fg)", label: "통과" },
  fail: { bg: "#F6DCD3", fg: "var(--color-danger)", label: "실패" },
  ambiguous: { bg: "var(--color-accent-soft)", fg: "var(--color-accent)", label: "보류" },
  not_run: { bg: "var(--color-surface-alt)", fg: "var(--color-text-muted)", label: "미실행" },
};

function CheckBadge({ kind, state }: { kind: string; state: CheckBadgeState }) {
  const s = BADGE_STYLE[state];
  return (
    <span
      title={`${CHECK_LABEL[kind] ?? kind}: ${s.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: "var(--r-pill)",
        fontSize: "var(--fs-xs)",
        fontWeight: 700,
        background: s.bg,
        color: s.fg,
      }}
    >
      {CHECK_LABEL[kind] ?? kind} {s.label}
    </span>
  );
}

function DecisionBadge({ decision }: { decision: "pending" | "approved" | "excluded" }) {
  const map = {
    pending: { bg: "var(--color-surface-alt)", fg: "var(--color-text-muted)", label: "대기" },
    approved: { bg: "var(--level-a2-bg)", fg: "var(--level-a2-fg)", label: "승인됨" },
    excluded: { bg: "#F6DCD3", fg: "var(--color-danger)", label: "제외됨" },
  } as const;
  const s = map[decision];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "var(--r-pill)",
        fontSize: "var(--fs-sm)",
        fontWeight: 700,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
}

const LEVELS: CefrLevel[] = ["A2", "B1", "B2"];

export function ReviewClient({
  edition,
  selectionByArticleId,
  hasSelectionReport,
}: {
  edition: PipelineEdition;
  selectionByArticleId: Record<string, CandidateReportEntry & { similarity: number }>;
  hasSelectionReport: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [publishErr, setPublishErr] = useState<string | null>(null);

  const articles = [...edition.articles].sort((a, b) => a.rankInEdition - b.rankInEdition);
  // The desk's front-page pick, if any. Without one the pipeline's rank 1
  // leads, which is what the reader app shows today.
  const leadId = edition.leadArticleId ?? null;
  const effectiveLeadId =
    leadId ??
    articles.find((a) => (a.reviewDecision ?? "pending") !== "excluded")?.id ??
    null;
  const approvedCount = articles.filter((a) => a.reviewDecision === "approved").length;
  const excludedCount = articles.filter((a) => a.reviewDecision === "excluded").length;
  const pendingCount = articles.length - approvedCount - excludedCount;

  function handleApproveAll() {
    setPublishErr(null);
    setPublishMsg(null);
    if (pendingCount === 0) {
      setPublishErr("대기 중인 기사가 없습니다.");
      return;
    }
    // Bulk approval is a convenience, not a bypass: the confirm spells out
    // what it will not touch.
    if (
      !window.confirm(
        `대기 중인 ${pendingCount}건을 한 번에 승인합니다.` +
          "\n보류(held) 기사와 이미 제외한 기사는 건드리지 않습니다.\n계속할까요?"
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await approveAllPendingAction(edition.editionDate);
      if (!res.ok) {
        setPublishErr(res.error ?? "전체 승인에 실패했습니다.");
        return;
      }
      const skipped = res.skipped ?? [];
      const detail = skipped
        .map((x) => `#${x.rankInEdition} ${x.reason}`)
        .join(", ");
      setPublishMsg(
        `${res.approved}건 승인` +
          (skipped.length > 0 ? ` · ${skipped.length}건 건너뜀 (${detail})` : "")
      );
    });
  }

  function handlePublish() {
    if (approvedCount === 0) {
      setPublishErr("승인된 기사가 없어 발행할 수 없습니다.");
      return;
    }
    if (!window.confirm(`${approvedCount}건을 발행합니다. 웹 홈에 즉시 반영됩니다. 계속할까요?`)) {
      return;
    }
    setPublishErr(null);
    setPublishMsg(null);
    startTransition(async () => {
      const res = await publishEditionAction(edition.editionDate);
      if (res.ok) {
        setPublishMsg(`발행 완료 — 승인 ${res.approvedCount}건 반영됨.`);
        if (res.warnings && res.warnings.length > 0) {
          setPublishMsg((m) => `${m} (경고 ${res.warnings!.length}건 — 콘솔 로그 참고)`);
          console.warn("[publish] warnings:", res.warnings);
        }
      } else {
        setPublishErr(res.error ?? "발행에 실패했습니다.");
      }
    });
  }

  return (
    <main>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "var(--sp-4)" }}>
        <div>
          <Link href="/admin" style={{ color: "var(--color-text-muted)", fontSize: "var(--fs-sm)", textDecoration: "none" }}>
            ← 에디션 목록
          </Link>
          <h1 style={{ fontSize: "var(--fs-h2)", fontWeight: 700, margin: "var(--sp-1) 0 0", color: "var(--color-text)" }}>
            {edition.editionDate} 검수 ({edition.status === "published" ? "발행됨" : "검수 대기"})
          </h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
            승인 {approvedCount} · 제외 {excludedCount} · 대기 {pendingCount} / 전체 {articles.length}
          </div>
          {/* Saves clicks on a long edition; the confirm states what it skips. */}
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={pending || pendingCount === 0}
            style={{
              padding: "var(--sp-3) var(--sp-5)",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--color-border-strong)",
              background: "var(--color-surface)",
              color: pendingCount === 0 ? "var(--color-text-muted)" : "var(--color-text)",
              fontFamily: "var(--font-ui)",
              fontSize: "var(--fs-ui)",
              fontWeight: 600,
              cursor: pending || pendingCount === 0 ? "not-allowed" : "pointer",
            }}
          >
            {`전체 승인 (${pendingCount}건)`}
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={pending || approvedCount === 0}
            style={{
              height: 40,
              padding: "0 var(--sp-4)",
              borderRadius: "var(--r-sm)",
              border: "none",
              background: approvedCount === 0 ? "var(--color-border-strong)" : "var(--color-accent)",
              color: "var(--color-text-invert)",
              fontWeight: 700,
              cursor: approvedCount === 0 || pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "발행 중…" : `발행 (${approvedCount}건)`}
          </button>
          {publishMsg && <p style={{ color: "var(--color-success)", fontSize: "var(--fs-sm)", marginTop: 6 }}>{publishMsg}</p>}
          {publishErr && <p style={{ color: "var(--color-danger)", fontSize: "var(--fs-sm)", marginTop: 6 }}>{publishErr}</p>}
        </div>
      </div>

      {!hasSelectionReport && (
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--color-text-muted)", marginBottom: "var(--sp-4)" }}>
          이 날짜의 selection-report 파일이 없어 선정 근거(점수)를 표시할 수 없습니다.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
        {articles.map((a) => (
          <ArticleCard
            key={a.id}
            editionDate={edition.editionDate}
            article={a}
            selection={selectionByArticleId[a.id]}
            isLead={a.id === effectiveLeadId}
            leadIsExplicit={a.id === leadId}
          />
        ))}
      </div>
    </main>
  );
}

function ArticleCard({
  editionDate,
  article,
  selection,
  isLead,
  leadIsExplicit,
}: {
  editionDate: string;
  article: PipelineArticle;
  selection?: CandidateReportEntry & { similarity: number };
  /** This article currently leads the edition. */
  isLead: boolean;
  /** The lead came from a desk decision rather than the pipeline's order. */
  leadIsExplicit: boolean;
}) {
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const gate = deriveGateStatus(article);
  const decision = article.reviewDecision ?? "pending";
  const version = article.versions.find((v) => v.version.level === level) ?? article.versions[0];

  function approve() {
    setErr(null);
    startTransition(async () => {
      const res = await approveArticleAction(editionDate, article.id);
      if (!res.ok) setErr(res.error ?? "승인 실패");
    });
  }

  function exclude() {
    if (reason.trim().length === 0) {
      setErr("제외 사유를 입력해 주세요.");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await excludeArticleAction(editionDate, article.id, reason);
      if (!res.ok) setErr(res.error ?? "제외 실패");
      else setReasonOpen(false);
    });
  }

  function setLead(next: string | null) {
    setErr(null);
    startTransition(async () => {
      const res = await setLeadArticleAction(editionDate, next);
      if (!res.ok) setErr(res.error ?? "1면 지정 실패");
    });
  }

  function reset() {
    setErr(null);
    startTransition(async () => {
      const res = await resetArticleDecisionAction(editionDate, article.id);
      if (!res.ok) setErr(res.error ?? "되돌리기 실패");
    });
  }

  return (
    <section
      style={{
        background: "var(--color-surface)",
        borderRadius: "var(--r-md)",
        border: gate.status === "held" ? "1px solid var(--color-danger)" : "1px solid var(--color-border)",
        padding: "var(--sp-4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <div style={{ minWidth: 260, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-2)" }}>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)", fontWeight: 700 }}>
              #{article.rankInEdition} · {article.category}
            </span>
            {isLead && (
              <span
                style={{
                  fontSize: "var(--fs-xs)",
                  fontWeight: 700,
                  background: "var(--color-accent)",
                  color: "var(--color-text-invert)",
                  borderRadius: "var(--r-pill)",
                  padding: "2px var(--sp-2)",
                }}
              >
                1면{leadIsExplicit ? "" : " (자동)"}
              </span>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "var(--fs-ui)", color: "var(--color-text)", fontWeight: 600 }}>
            {article.eventSummary}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sp-2)" }}>
          <DecisionBadge decision={decision} />
        </div>
      </div>

      {gate.status === "held" && (
        <div
          style={{
            marginTop: "var(--sp-3)",
            background: "#F6DCD3",
            color: "var(--color-danger)",
            borderRadius: "var(--r-sm)",
            padding: "var(--sp-2) var(--sp-3)",
            fontSize: "var(--fs-sm)",
          }}
        >
          <strong>보류(held)</strong> — 승인 불가:
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {gate.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Level tabs */}
      <div role="tablist" aria-label="레벨" style={{ display: "flex", gap: 4, marginTop: "var(--sp-4)" }}>
        {LEVELS.map((lv) => {
          const gv = article.versions.find((v) => v.version.level === lv);
          const selected = lv === level;
          return (
            <button
              key={lv}
              role="tab"
              aria-selected={selected}
              onClick={() => setLevel(lv)}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--r-sm) var(--r-sm) 0 0",
                border: "1px solid var(--color-border)",
                borderBottom: selected ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                background: selected ? "var(--color-surface)" : "var(--color-surface-alt)",
                color: selected ? "var(--color-text)" : "var(--color-text-muted)",
                fontWeight: 700,
                fontSize: "var(--fs-sm)",
                cursor: "pointer",
              }}
            >
              {lv} {gv && !gv.passed ? "⚠" : ""}
            </button>
          );
        })}
      </div>

      {version && (
        <div style={{ border: "1px solid var(--color-border)", borderTop: "none", borderRadius: "0 0 var(--r-sm) var(--r-sm)", padding: "var(--sp-4)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "var(--sp-3)" }}>
            {ALL_CHECK_KINDS.map((kind) => (
              <CheckBadge key={kind} kind={kind} state={checkBadgeState(findCheck(version, kind))} />
            ))}
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)", alignSelf: "center" }}>
              재작성 시도 {version.rewriteAttempts}회 · {version.version.wordCount}단어
            </span>
          </div>

          <h3 style={{ fontSize: "var(--fs-h3)", margin: "0 0 var(--sp-2)", color: "var(--color-text)" }}>
            {version.version.title}
          </h3>
          <div
            style={{
              fontFamily: "var(--font-en, serif)",
              fontSize: "var(--fs-sm)",
              lineHeight: 1.7,
              color: "var(--color-text)",
              whiteSpace: "pre-wrap",
              maxHeight: 260,
              overflowY: "auto",
              background: "var(--color-surface-alt)",
              borderRadius: "var(--r-sm)",
              padding: "var(--sp-3)",
            }}
          >
            {version.version.content}
          </div>

          <details style={{ marginTop: "var(--sp-3)" }}>
            <summary style={{ cursor: "pointer", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              단어 목록 ({version.version.words.length})
            </summary>
            <ul style={{ margin: "var(--sp-2) 0 0", paddingLeft: 18, fontSize: "var(--fs-sm)" }}>
              {version.version.words.map((w) => (
                <li key={w.term}>
                  <strong>{w.term}</strong> {w.pronunciation ? `[${w.pronunciation}]` : ""} — {w.meaningKo}
                  {w.isKey ? " (핵심)" : ""}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Provenance */}
      <details style={{ marginTop: "var(--sp-3)" }}>
        <summary style={{ cursor: "pointer", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
          사실·소스 (facts {article.facts.length} · sources {article.sources.length})
        </summary>
        <ul style={{ margin: "var(--sp-2) 0 0", paddingLeft: 0, listStyle: "none", fontSize: "var(--fs-sm)" }}>
          {article.facts.map((f, i) => (
            <li key={i} style={{ padding: "var(--sp-2) 0", borderTop: i > 0 ? "1px solid var(--color-border)" : "none" }}>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
                <span
                  style={{
                    flexShrink: 0,
                    padding: "1px 8px",
                    borderRadius: "var(--r-pill)",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 700,
                    background: f.sourceCount >= 2 ? "var(--level-a2-bg)" : "#F6DCD3",
                    color: f.sourceCount >= 2 ? "var(--level-a2-fg)" : "var(--color-danger)",
                  }}
                >
                  {f.sourceCount >= 2 ? `2소스+ (${f.sourceCount})` : "단일소스"}
                </span>
                {f.usedInText && (
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)" }}>본문 사용됨</span>
                )}
                {f.searchSummaryOnly && (
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--color-accent)" }}>요약만(원문 미확인)</span>
                )}
              </div>
              <p style={{ margin: "4px 0 0", color: "var(--color-text)" }}>{f.statement}</p>
              <p style={{ margin: "2px 0 0", color: "var(--color-text-muted)", fontSize: "var(--fs-xs)" }}>
                확인: {f.confirmedByOutlets.join(", ") || "—"}
                {f.note ? ` · ${f.note}` : ""}
              </p>
            </li>
          ))}
        </ul>
        <ul style={{ margin: "var(--sp-3) 0 0", paddingLeft: 18, fontSize: "var(--fs-xs)" }}>
          {article.sources.map((s, i) => (
            <li key={i}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-link)" }}>
                {s.outlet}: {s.title}
              </a>
            </li>
          ))}
        </ul>
      </details>

      {/* Selection rationale */}
      {selection && (
        <details style={{ marginTop: "var(--sp-3)" }}>
          <summary style={{ cursor: "pointer", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
            선정 근거 (점수 {selection.score.toFixed(2)}, 매칭 신뢰도 {(selection.similarity * 100).toFixed(0)}%)
          </summary>
          <ul style={{ margin: "var(--sp-2) 0 0", paddingLeft: 18, fontSize: "var(--fs-xs)", color: "var(--color-text-secondary)" }}>
            {Object.entries(selection.scoreBreakdown).map(([k, v]) => (
              <li key={k}>
                {k}: {typeof v === "number" ? v.toFixed(2) : String(v)}
              </li>
            ))}
          </ul>
          {selection.rejectionReasons.length > 0 && (
            <p style={{ fontSize: "var(--fs-xs)", color: "var(--color-text-muted)", marginTop: 6 }}>
              {selection.rejectionReasons.join(" / ")}
            </p>
          )}
        </details>
      )}

      {/* Actions */}
      <div style={{ marginTop: "var(--sp-4)", display: "flex", gap: "var(--sp-2)", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={approve}
          disabled={pending || gate.status === "held" || decision === "approved"}
          title={gate.status === "held" ? gate.reasons.join(" / ") : undefined}
          style={{
            height: 36,
            padding: "0 var(--sp-4)",
            borderRadius: "var(--r-sm)",
            border: "none",
            background: gate.status === "held" || decision === "approved" ? "var(--color-border-strong)" : "var(--color-accent)",
            color: "var(--color-text-invert)",
            fontWeight: 700,
            fontSize: "var(--fs-sm)",
            cursor: gate.status === "held" || decision === "approved" || pending ? "not-allowed" : "pointer",
          }}
        >
          승인
        </button>
        <button
          type="button"
          onClick={() => setReasonOpen((o) => !o)}
          disabled={pending || decision === "excluded"}
          style={{
            height: 36,
            padding: "0 var(--sp-4)",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--color-danger)",
            background: "transparent",
            color: "var(--color-danger)",
            fontWeight: 700,
            fontSize: "var(--fs-sm)",
            cursor: pending || decision === "excluded" ? "not-allowed" : "pointer",
          }}
        >
          제외
        </button>
        {/* The pipeline ranks the ten; the desk decides which one leads. */}
        <button
          type="button"
          onClick={() => setLead(leadIsExplicit ? null : article.id)}
          disabled={pending || gate.status === "held" || decision === "excluded"}
          style={{
            padding: "var(--sp-2) var(--sp-4)",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--color-border-strong)",
            background: leadIsExplicit ? "var(--color-accent-soft)" : "transparent",
            color:
              gate.status === "held" || decision === "excluded"
                ? "var(--color-text-muted)"
                : "var(--color-text)",
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-sm)",
            cursor:
              pending || gate.status === "held" || decision === "excluded"
                ? "not-allowed"
                : "pointer",
          }}
        >
          {leadIsExplicit ? "1면 해제" : "1면으로"}
        </button>
        {decision !== "pending" && (
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            style={{
              height: 36,
              padding: "0 var(--sp-3)",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--color-border-strong)",
              background: "transparent",
              color: "var(--color-text-secondary)",
              fontSize: "var(--fs-sm)",
              cursor: "pointer",
            }}
          >
            대기로 되돌리기
          </button>
        )}
        {err && <span style={{ color: "var(--color-danger)", fontSize: "var(--fs-sm)" }}>{err}</span>}
      </div>

      {reasonOpen && (
        <div style={{ marginTop: "var(--sp-2)", display: "flex", gap: "var(--sp-2)" }}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="제외 사유 (필수)"
            style={{
              flex: 1,
              height: 36,
              padding: "0 var(--sp-3)",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--color-border-strong)",
              fontSize: "var(--fs-sm)",
            }}
          />
          <button
            type="button"
            onClick={exclude}
            disabled={pending}
            style={{
              height: 36,
              padding: "0 var(--sp-4)",
              borderRadius: "var(--r-sm)",
              border: "none",
              background: "var(--color-danger)",
              color: "var(--color-text-invert)",
              fontWeight: 700,
              fontSize: "var(--fs-sm)",
              cursor: "pointer",
            }}
          >
            확정
          </button>
        </div>
      )}

      {decision === "excluded" && article.excludeReason && (
        <p style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--color-danger)" }}>
          제외 사유: {article.excludeReason}
        </p>
      )}
    </section>
  );
}
