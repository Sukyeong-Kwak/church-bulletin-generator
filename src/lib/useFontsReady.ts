"use client";

import { useEffect, useState } from "react";

/**
 * 주보에 쓰는 글꼴. 화면 UI 글꼴(Pretendard)은 여기 없다.
 * globals.css 의 @font-face 이름과 같아야 한다.
 */
const BULLETIN_FONTS = ["HSSaemaul", "ACCKidsHeart", "Cafe24Ssurround", "BMJUA", "Jalnan"];

/**
 * 주보 글꼴이 다 내려왔는지.
 *
 * 글자 크기를 재는 일은 폰트가 붙은 뒤라야 뜻이 있다. 기본 폰트로 잰 값은
 * 주보에 쓰는 글꼴과 폭이 달라, 그 값으로 자리를 잡으면 폰트가 붙는 순간 어긋난다.
 *
 * 주보 글꼴만 기다린다. 예전에는 document.fonts.ready 로 '이 문서의 모든 폰트'를 기다렸는데,
 * 거기에는 화면 UI 글꼴 2MB 가 함께 걸려 있었다. 주보 조판과는 아무 상관이 없는 파일 하나 때문에
 * 미리보기가 제자리를 잡는 일이 매번 그만큼 늦어졌다.
 *
 * 폰트 API가 없는 환경(옛 브라우저·서버 렌더 뒤 첫 붙임)에서는 기다리지 않는다.
 * 재는 일 자체가 멈추는 것보다, 한 번 어긋났다가 바로잡히는 편이 낫다.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;

    if (!fonts?.load) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 폰트 API가 없으면 즉시 측정을 시작한다
      setReady(true);
      return;
    }

    // 못 받은 글꼴 하나가 나머지를 붙잡지 않게 한다 — 그 자리는 시스템 글꼴로 그려진다
    Promise.all(BULLETIN_FONTS.map((f) => fonts.load(`16px "${f}"`).catch(() => undefined))).then(
      () => {
        if (alive) setReady(true);
      },
    );

    return () => {
      alive = false;
    };
  }, []);

  return ready;
}
