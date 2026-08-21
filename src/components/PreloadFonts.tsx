"use client";

import ReactDOM from "react-dom";

/**
 * 주보 글꼴을 문서를 읽는 첫 순간에 부른다.
 *
 * 그냥 두면 이 두 글꼴은 한참 뒤에야 요청된다. 브라우저는 @font-face 를 읽어두기만 하고,
 * 그 글꼴을 실제로 쓰는 글자가 화면에 놓일 때 비로소 받으러 간다. 그런데 주보를 그리는 것은
 * 브라우저에 붙은 뒤(hydration) 도는 화면이라, 자바스크립트가 다 내려와 붙기 전에는
 * 그 글자가 어디에도 없다. 결국 '내려받기 → 붙기 → 그제서야 글꼴 요청'이 줄줄이 이어진다.
 *
 * 여기서 미리 불러두면 그 요청이 맨 앞으로 온다 — 자바스크립트가 내려오는 동안 글꼴도 함께
 * 내려와, 주보가 처음 그려질 때 이미 제 글꼴로 선다. 조판을 재는 일도 폰트가 붙은 뒤라야
 * 뜻이 있어서(useFontsReady), 이 시간이 곧 미리보기가 제자리를 잡는 시간이다.
 *
 * 두 개만 부른다. 표지 제목용 세 글꼴(Cafe24Ssurround·BMJUA·Jalnan)은 골랐을 때만 쓰이는데,
 * 셋을 합치면 800KB 다 — 쓰지도 않을 것을 먼저 받으면 정작 필요한 것이 뒤로 밀린다.
 *
 * globals.css 의 @font-face 와 같은 파일을 가리켜야 한다. 어긋나면 같은 글꼴을 두 번 받는다.
 */
const PRELOAD = ["/fonts/HSSaemaul.woff2", "/fonts/ACCKidsHeart.woff2"];

export function PreloadFonts() {
  for (const href of PRELOAD) {
    // crossOrigin 이 없으면 글꼴은 익명 요청으로 한 번 더 받는다 — 미리 받아둔 것이 버려진다
    ReactDOM.preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  }
  return null;
}
