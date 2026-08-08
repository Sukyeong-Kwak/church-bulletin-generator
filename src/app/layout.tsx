import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DocProvider } from "@/lib/store";
import { Nav } from "@/components/Nav";
import { PopupProvider } from "@/components/Popup";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "THE PIECE 주보",
  description: "배경과 광고만 넣으면 자동으로 조판되는 청년교구 주보 만들기",
  icons: { icon: "/logo/the-piece.svg" },
  /*
   * 검색에 걸리지 않게 한다.
   *
   * 로그인해야 열리는 화면들은 크롤러가 어차피 못 보지만, /now는 다르다.
   * 교회 QR이 가리키는 자리라 로그인 없이 열리고, 그 안에 그 달 생일 명단이 들어간다.
   * 색인되면 이름으로 검색해 생일이 나오는 상태가 된다.
   *
   * 여기는 교인이 QR을 찍어 들어오는 곳이지 검색으로 찾아올 곳이 아니라, 통째로 닫는다.
   */
  robots: { index: false, follow: false },
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
        {/*
          팝업은 가장 바깥에 둔다. 어느 화면에서 부르든 같은 자리에 뜨고,
          화면이 바뀌어도 떠 있던 안내가 함께 사라지지 않는다.
        */}
        <PopupProvider>
          <DocProvider>
            <Nav />
            <main className="flex-1 min-h-0 overflow-auto">{children}</main>
          </DocProvider>
        </PopupProvider>
        <Analytics />
      </body>
    </html>
  );
}
