import type { Metadata } from "next";
import { Lora } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// 영문 학습 본문용 세리프 (a3-ui-ux.md §0 — --font-en)
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

// 한글 UI용 산세리프 Pretendard — CDN 허용 (a3-ui-ux.md §0 — --font-ui)
const PRETENDARD_CDN_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css";

export const metadata: Metadata = {
  title: "BRIEFLY",
  description:
    "하루 10개 뉴스를 A2/B1/B2 레벨로 새로 써서 전하는 영어 학습 뉴스 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${lora.variable} h-full antialiased`}>
      <head>
        <link rel="stylesheet" href={PRETENDARD_CDN_URL} />
        {/* Apply saved theme before first paint to avoid a light/dark flash.
            Reads the same key sessionStore uses (src/lib/session.ts). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=JSON.parse(localStorage.getItem("briefly:session:v1")||"{}");if(s.theme==="dark"||s.theme==="light"){document.documentElement.setAttribute("data-theme",s.theme);}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
