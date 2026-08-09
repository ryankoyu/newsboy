import Link from "next/link";
import { localFsEditionRepository } from "@/lib/admin/localFsEditionRepository";

/**
 * /admin — edition list (production-readiness.md §2 "검수 대기 에디션
 * 조회"). Date + status(검수 대기/발행됨) + article count + gate pass/hold
 * summary, per task instruction.
 */
export default async function AdminHomePage() {
  const editions = await localFsEditionRepository.listEditions();

  return (
    <main>
      <h1
        style={{
          fontSize: "var(--fs-h2)",
          fontWeight: 700,
          color: "var(--color-text)",
          margin: "0 0 var(--sp-4)",
        }}
      >
        에디션 목록
      </h1>

      {editions.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: "var(--fs-sm)" }}>
          pipeline/output/editions/ 에 에디션 파일이 없습니다.
        </p>
      ) : (
        <div
          style={{
            background: "var(--color-surface)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--color-border)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-sm)" }}>
            <thead>
              <tr style={{ background: "var(--color-surface-alt)", textAlign: "left" }}>
                <Th>날짜</Th>
                <Th>상태</Th>
                <Th>기사 수</Th>
                <Th>승인</Th>
                <Th>제외</Th>
                <Th>대기</Th>
                <Th>게이트 보류</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {editions.map((e) => (
                <tr key={e.editionDate} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <Td>
                    <Link
                      href={`/admin/${e.editionDate}`}
                      style={{ color: "var(--color-link)", fontWeight: 600, textDecoration: "none" }}
                    >
                      {e.editionDate}
                    </Link>
                  </Td>
                  <Td>
                    <StatusBadge status={e.status} />
                  </Td>
                  <Td>{e.articleCount}</Td>
                  <Td>{e.approvedCount}</Td>
                  <Td>{e.excludedCount}</Td>
                  <Td>{e.pendingCount}</Td>
                  <Td>
                    {e.heldCount > 0 ? (
                      <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>{e.heldCount}</span>
                    ) : (
                      0
                    )}
                  </Td>
                  <Td>
                    <Link href={`/admin/${e.editionDate}`} style={{ color: "var(--color-accent)" }}>
                      검수 →
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th style={{ padding: "var(--sp-2) var(--sp-3)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "var(--sp-2) var(--sp-3)", color: "var(--color-text)" }}>{children}</td>;
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  const isPublished = status === "published";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px var(--sp-2)",
        borderRadius: "var(--r-pill)",
        fontSize: "var(--fs-xs)",
        fontWeight: 700,
        background: isPublished ? "var(--level-a2-bg)" : "var(--color-accent-soft)",
        color: isPublished ? "var(--level-a2-fg)" : "var(--color-accent)",
      }}
    >
      {isPublished ? "발행됨" : "검수 대기"}
    </span>
  );
}
