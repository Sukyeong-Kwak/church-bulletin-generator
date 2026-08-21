"use client";

import { ZOOM } from "@/lib/useZoom";

/**
 * 미리보기 확대 조절기.
 *
 * 본문 작성과 전체 보기가 같은 것을 나란히 두고 있었다. 한 곳만 고치면 두 화면의
 * 조절기가 서로 다른 범위를 갖게 되는 자리라 하나로 모은다.
 */
export function ZoomSlider({ zoom, onChange }: { zoom: number; onChange: (v: number) => void }) {
  return (
    <label
      className="ml-auto flex items-center gap-1.5 text-[11px]"
      style={{ color: "var(--ui-muted)" }}
    >
      확대
      <input
        type="range"
        min={ZOOM.min}
        max={ZOOM.max}
        step={ZOOM.step}
        value={zoom}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 110 }}
      />
      {Math.round(zoom * 100)}%
    </label>
  );
}
