import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 폴더의 lockfile을 워크스페이스 루트로 잘못 잡는 것을 막는다
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
