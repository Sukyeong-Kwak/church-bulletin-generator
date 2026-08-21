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

      /*
       * 글꼴은 한 번 받으면 다시 묻지 않는다.
       *
       * public/ 에 둔 파일에 Next 가 붙이는 기본값은 `max-age=0` 이다 — 내용이 바뀔 수 있다고
       * 보기 때문인데, 그래서 화면을 열 때마다 글꼴 여섯 개를 '그대로냐'고 서버에 물어본다.
       * 파일은 오지 않아도(304) 왕복은 그대로 들고, 폰에서는 그 왕복이 주보가 제 글꼴로
       * 자리 잡는 시간이 된다.
       *
       * 주보 글꼴은 파일 이름이 곧 글꼴 이름이라 내용이 바뀔 일이 없다. 그래서 immutable —
       * 브라우저는 묻지도 않고 제 것을 쓴다.
       *
       * 다만 그 약속 때문에, 글꼴 파일을 갈아 끼울 때는 반드시 이름을 함께 바꿔야 한다.
       * 같은 이름으로 덮으면 이미 받아 간 사람에게는 1년 동안 옛 글꼴이 남는다.
       */
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
