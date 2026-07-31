import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DocProvider } from "@/lib/store";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "THE PIECE 주보",
  description: "배경과 광고만 넣으면 자동으로 조판되는 청년교구 주보 만들기",
  icons: { icon: "/logo/the-piece.svg" },
};

/** 데스크탑이 주 사용 환경이지만 태블릿·모바일에서도 작업할 수 있게 한다 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 크롬 확장들이 React가 붙기 전에 <html>·<body>에 제 속성을 끼워 넣는다
  // (foxified, cz-shortcut-listen 등). 그 한 겹만 눈감아 주는 표시로,
  // 안쪽에서 진짜 불일치가 나면 그대로 경고가 뜬다.
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full flex flex-col overflow-hidden" suppressHydrationWarning>
        <DocProvider>
          <Nav />
          <main className="flex-1 min-h-0 overflow-auto">{children}</main>
        </DocProvider>
      </body>
    </html>
  );
}
