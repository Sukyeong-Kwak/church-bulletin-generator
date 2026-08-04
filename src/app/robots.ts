import type { MetadataRoute } from "next";

/**
 * 검색엔진에게 주는 안내.
 *
 * 막는 일은 여기가 아니라 layout.tsx의 `robots: { index: false }`가 한다.
 * 여기서 `Disallow: /`로 잠그면 오히려 반대로 간다 — 크롤러가 페이지를 가져가지 않아
 * noindex 표시를 보지도 못하고, 다른 곳에 링크가 걸리면 주소만 색인에 남을 수 있다.
 *
 * 그래서 읽는 것은 열어두고, 읽고 나서 "싣지 말라"는 표시를 보게 한다.
 * sitemap은 두지 않는다 — 검색에 올릴 것이 없다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
