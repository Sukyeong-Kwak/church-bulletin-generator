"use client";

import { useEffect, useState } from "react";

/**
 * 웹폰트가 다 내려왔는지.
 *
 * 글자 크기를 재는 일은 폰트가 붙은 뒤라야 뜻이 있다. 기본 폰트로 잰 값은
 * 주보에 쓰는 글꼴과 폭이 달라, 그 값으로 자리를 잡으면 폰트가 붙는 순간 어긋난다.
 *
 * 폰트 API가 없는 환경(옛 브라우저·서버 렌더 뒤 첫 붙임)에서는 기다리지 않는다.
 * 재는 일 자체가 멈추는 것보다, 한 번 어긋났다가 바로잡히는 편이 낫다.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;

    if (fonts?.ready) {
      fonts.ready.then(() => {
        if (alive) setReady(true);
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 폰트 API가 없으면 즉시 측정을 시작한다
      setReady(true);
    }

    return () => {
      alive = false;
    };
  }, []);

  return ready;
}
