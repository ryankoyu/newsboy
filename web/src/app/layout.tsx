import type { Metadata } from "next";
import { IBM_Plex_Mono, Lora } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

// 영문 학습 본문용 세리프 (a3-ui-ux.md §0 — --font-en)
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

// 발음기호 (a3-ui-ux.md §0 — --font-mono). Referenced by the token since the
// first design pass but never actually loaded, so IPA fell back to the system
// monospace.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// The newsprint skin also loaded Noto Serif Display (with its width axis) and
// UnifrakturMaguntia for the nameplate. Both went with the skin — an unused
// webfont is bandwidth every reader pays for and nobody sees.

// 한글 UI용 산세리프 Pretendard — CDN 허용 (a3-ui-ux.md §0 — --font-ui)
const PRETENDARD_CDN_URL =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css";

export const metadata: Metadata = {
  title: "Newsboy",
  description:
    "하루 10개 뉴스를 A2/B1/B2 레벨로 새로 써서 전하는 영어 학습 뉴스 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${lora.variable} ${plexMono.variable} h-full antialiased`}
    >
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
