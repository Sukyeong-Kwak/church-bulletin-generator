"use client";

import { useId } from "react";
import { CANVAS, coverFontCss, type CoverFontKey } from "@/lib/layout";
import type { CoverText } from "@/lib/types";

const SIDE_PAD = 44;

/**
 * 표지 글자 한 줄.
 * curve가 0보다 크면 가운데가 위로 솟는 곡선을 따라 글자가 휘어진다(아치형 교회명).
 * 테두리는 paint-order로 글자 뒤에 깔아 원본처럼 얇게 둘러진다.
 */
export function CoverTextView({ item }: { item: CoverText }) {
  const uid = useId().replace(/:/g, "");
  const pathId = `cover-${uid}-${item.id}`;

  // 양수면 가운데가 위로 솟고(∩), 음수면 아래로 처진다(∪)
  const curve = item.kind === "arch" ? item.curve : 0;
  const height = item.size * 1.6 + Math.abs(curve);
  // 위로 솟는 만큼 위쪽 여유를 두고 기준선을 내린다
  const baseY = (curve > 0 ? curve : 0) + item.size * 1.25;
  const d = `M ${SIDE_PAD},${baseY} Q ${CANVAS.w / 2},${baseY - curve * 2} ${
    CANVAS.w - SIDE_PAD
  },${baseY}`;

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: item.y,
        width: CANVAS.w,
        height,
        // 많이 휘면 글자가 상자 밖으로 나가므로 잘리지 않게 둔다
        overflow: "visible",
      }}
      viewBox={`0 0 ${CANVAS.w} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <path id={pathId} d={d} fill="none" />
      </defs>
      <text
        textAnchor="middle"
        style={{
          fontFamily: coverFontCss(item.font as CoverFontKey | undefined, item.titleFont),
          fontSize: item.size,
          letterSpacing: item.letterSpacing ?? 0,
          fill: item.color,
          stroke: item.outline ?? "none",
          strokeWidth: item.outline ? (item.outlineWidth ?? 3) : 0,
          strokeLinejoin: "round",
          paintOrder: "stroke",
        }}
      >
        <textPath href={`#${pathId}`} startOffset="50%">
          {item.text}
        </textPath>
      </text>
    </svg>
  );
}
