import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 폴더의 lockfile을 워크스페이스 루트로 잘못 잡는 것을 막는다
  turbopack: {
    root: path.resolve(__dirname),
  },

  /*
   * 관리자 매뉴얼 PDF는 public/에 두지 않는다 — 거기 두면 주소만 알면 누구나 받는다.
   * 대신 서버가 역할을 확인하고 읽어서 내보내는데, 코드에서 import하지 않는 파일이라
   * 배포할 때 따라가지 않는다. 여기서 그 한 개를 집어 넣어준다.
   */
  outputFileTracingIncludes: {
    "/api/manual/admin": ["src/assets/manual/**/*"],
  },

  /*
   * 사용자 매뉴얼 PDF도 검색에서 뺀다.
   *
   * 화면들은 layout.tsx의 noindex 표시로 막았지만 PDF에는 그 표시를 넣을 자리가 없다.
   * 로그인 없이 열어둔 유일한 파일이고 첫 장에 교회 이름이 있어, 헤더로 같은 말을 해준다.
   */
  async headers() {
    return [
      {
        source: "/manual/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
