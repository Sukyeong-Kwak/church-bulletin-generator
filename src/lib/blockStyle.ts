import { FONT_SIZE, type Role } from "./layout";
import type { FlowBlock, TextStyle } from "./types";

/**
 * 블록에서 '본문'에 해당하는 자리.
 *
 * 종류마다 이름이 다르다 — 광고는 본문, 주요일정은 항목, 본문 말씀은 본문 줄.
 * 글자 크기를 손대는 자리가 여럿이라(블록 줄의 −/+, 넘침 고치기) 한 곳에 둔다.
 */
export function bodySlot(block: FlowBlock): {
  key: "bodyStyle" | "itemStyle" | "lineStyle";
  role: Role;
  style?: TextStyle;
} {
  switch (block.kind) {
    case "ad":
      return { key: "bodyStyle", role: "blockBody", style: block.bodyStyle };
    case "schedule":
      return { key: "itemStyle", role: "scheduleItem", style: block.itemStyle };
    case "sermon":
      return { key: "lineStyle", role: "sermonLine", style: block.lineStyle };
  }
}

export function clampFontSize(v: number): number {
  return Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, v));
}

/**
 * 고른 블록의 본문 글자를 몇 px 키우거나 줄인다.
 *
 * 기준은 화면에 그려진 값이 아니라 그 블록에 적혀 있는 값이다 — 아직 손대지 않은 블록은
 * 적힌 것이 없으므로 그 자리의 기본 크기에서 출발한다. 그래야 연달아 눌러도 한 칸씩 쌓인다.
 */
export function resizeBodies(
  blocks: FlowBlock[],
  ids: ReadonlySet<string>,
  delta: number,
  baseSizeOf: (role: Role) => number,
): FlowBlock[] {
  return blocks.map((b) => {
    if (!ids.has(b.id)) return b;
    const slot = bodySlot(b);
    const from = slot.style?.fontSize ?? baseSizeOf(slot.role);
    const next = clampFontSize(from + delta);
    if (next === from && slot.style?.fontSize !== undefined) return b;
    return { ...b, [slot.key]: { ...slot.style, fontSize: next } } as FlowBlock;
  });
}
