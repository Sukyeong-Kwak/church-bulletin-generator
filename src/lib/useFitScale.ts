"use client";

import { useEffect, useState } from "react";
import { CANVAS } from "./layout";

/** 이 폭보다 좁으면 좌우 2단이 아니라 한 번에 한 화면씩 쓴다 (SplitView의 lg 기준과 같다) */
const WIDE = 1024;

/**
 * 미리보기 시작 배율.
 *
 * 좁은 화면에서는 주보 한 장이 화면 폭에 통째로 들어오게 맞춘다. 태블릿을 돌리거나
 * 창을 줄이면 폭이 달라지므로 그때마다 다시 맞춘다 — 한 번만 재고 말면 가로로 돌린 뒤
 * 주보가 화면을 넘어가 버린다.
 *
 * 서버에서는 창 크기를 알 수 없어 넓은 화면 기준값으로 그리고, 브라우저에 붙은 뒤
 * 실제 폭으로 고쳐 잡는다.
 */
export function useFitScale(wide: number, max = 0.55, pad = 48): number {
  const [scale, setScale] = useState(wide);

  useEffect(() => {
    const fit = () =>
      setScale(
        window.innerWidth >= WIDE ? wide : Math.min(max, (window.innerWidth - pad) / CANVAS.w),
      );
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [wide, max, pad]);

  return scale;
}
