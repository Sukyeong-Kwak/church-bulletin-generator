"use client";

import { useCallback, useEffect, useState } from "react";
import { useFitScale } from "./useFitScale";

/** 확대 조절기가 오갈 수 있는 범위 — 화면마다 따로 적어두면 한쪽만 바뀐다 */
export const ZOOM = { min: 0.15, max: 0.9, step: 0.05 } as const;

const KEY_PREFIX = "bulletin-zoom-";

/**
 * 미리보기 확대 배율.
 *
 * 손대기 전에는 화면 폭에 맞춰 두다가, 사용자가 조절기를 움직이는 순간부터 그 값을 지킨다.
 * 그리고 그 값을 이 브라우저에 적어둔다 — 예전에는 화면 안에만 들고 있어서 본문 작성과
 * 전체 보기를 오갈 때마다 처음 배율로 돌아갔다. 주보 한 부를 만드는 동안 그 두 화면을
 * 여러 번 오가는데, 그때마다 조절기를 다시 끌어야 했다.
 *
 * 화면마다 따로 적는다(key). 본문 작성은 본문만, 전체 보기는 표지까지 여덟 장을 세우므로
 * 눈에 맞는 배율이 처음부터 다르다.
 */
export function useZoom(key: string, wide: number): {
  zoom: number;
  setZoom: (v: number) => void;
} {
  const fit = useFitScale(wide);
  const [picked, setPicked] = useState<number | null>(null);

  // 저장소는 첫 렌더 뒤에만 읽는다 — 초기값에서 읽으면 서버가 그린 것과 달라져 하이드레이션이 깨진다
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY_PREFIX + key);
    } catch {
      // 저장소를 막아둔 브라우저면 화면 폭에 맞춘 값으로 간다
    }
    const v = Number(stored);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 적어둔 값은 브라우저에 붙은 뒤라야 읽을 수 있다
    if (Number.isFinite(v) && v >= ZOOM.min && v <= ZOOM.max) setPicked(v);
  }, [key]);

  const setZoom = useCallback(
    (v: number) => {
      setPicked(v);
      try {
        localStorage.setItem(KEY_PREFIX + key, String(v));
      } catch {
        // 적어두지 못해도 이번 화면에서는 그대로 쓴다
      }
    },
    [key],
  );

  return { zoom: picked ?? fit, setZoom };
}
