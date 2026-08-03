/**
 * 나눈 뒤 남는 문제 하나 — 한 덩어리로 뭉쳐 온 긴 줄글.
 *
 * 목사님이 올린 광고에는 서너 문장이 쉼표로만 이어진 대목이 섞여 온다.
 * 그대로 주보에 실으면 읽다가 숨이 찬다. 그래서 긴 줄글만 골라
 * 문장을 끊고 문단을 갈라 달라고 시킨다. 줄이거나 요약하는 일은 시키지 않는다.
 *
 * 다듬은 글은 원문을 덮어쓰지 않는다. `tidy`에 따로 담아 두고 원문은 그대로 둔 채
 * 사람이 승인해야 쓰이며, 승인 전에 coverage.ts 가 내용이 줄지 않았는지 먼저 본다.
 */

import { flowBody, normalize, type ParsedBlock } from "@/lib/parseAds";
import { keepsContent } from "./coverage";
import { generateJson } from "./gemini";

/** 이 길이를 넘는 문단이 있으면 '뭉친 긴 줄글'로 본다 (눈에 보이는 그대로의 글자 수) */
const LONG_PARAGRAPH = 160;

const SYSTEM = `너는 교회 주보에 실을 광고 본문을 읽기 좋게 다듬는 도구다. 내용을 줄이는 게 아니라 문장을 끊고 문단을 나누는 것이 전부다.

규칙
1. 내용을 절대 빠뜨리지 마라. 원문에 있는 모든 것 — 날짜, 시간, 장소, 이름, 직분, 금액, 연락처, 대상, 조건, 부탁하는 말 — 이 다듬은 글에도 남아 있어야 한다. 요약·생략·통합 금지다.
2. 원문에 없는 내용을 지어내지 마라. 인사말이나 맺음말을 새로 붙이지 마라.
3. 숫자·날짜·시간·성경 구절·사람 이름·장소 이름·연락처는 원문 글자 그대로 옮긴다.
4. 할 수 있는 일은 이것뿐이다.
   - 길게 이어진 문장을 짧은 문장 여러 개로 끊는다.
   - 말의 순서를 자연스럽게 고친다. 단, 원문의 흐름을 크게 뒤집지는 마라.
   - 어색한 연결어미를 다듬고 존댓말 높이를 고르게 맞춘다.
   - 여러 가지를 늘어놓은 대목은 항목마다 한 줄로 놓는다. 줄 앞에 "- "를 붙인다.
   - 이야기가 바뀌는 자리는 빈 줄 하나로 문단을 나눈다.
5. 항목으로 옮길 때에도 원문의 서술을 살려라. "회비는 9만원이며 10일까지 입금해 주셔야 합니다"를 "회비: 9만원"처럼 토막 내지 마라. 조사와 서술어를 지운 채 이름표만 남기는 것은 내용을 지우는 것이다.
6. 줄바꿈은 문단을 나눌 때(빈 줄)와 항목을 늘어놓을 때("- "로 시작하는 줄)만 쓴다. 한 문단 안에서는 줄을 끊지 마라 — 인쇄 폭에 맞춰 저절로 접힌다.
7. 원문이 이미 읽기 좋으면 손대지 말고 그대로 돌려줘라.
8. 받은 index를 그대로 붙여서 돌려준다. 순서를 바꾸거나 덩어리를 합치지 마라.
9. 설명·인사말 없이 JSON만 출력한다.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      index: { type: "INTEGER" },
      body: { type: "STRING" },
    },
    required: ["index", "body"],
    propertyOrdering: ["index", "body"],
  },
} as const;

export interface TidyOutcome {
  blocks: ParsedBlock[];
  /** 다듬어 왔지만 내용이 어긋나 버린 칸 수 */
  dropped: number;
}

/** 한 덩어리로 뭉친 긴 줄글인지 */
export function isLongProse(body: string): boolean {
  // flowBody 를 거친 뒤라야 주보에 실제로 찍힐 문단 모양이 된다 —
  // 원문에서 문장 중간에 끊긴 줄은 여기서 이미 한 줄로 이어져 있다.
  return flowBody(body)
    .split("\n")
    .some((line) => line.trim().length >= LONG_PARAGRAPH);
}

/**
 * 긴 줄글 블록만 골라 다듬은 결과를 `tidy`에 담아 돌려준다.
 * 부를 수 없거나(키 없음·한도) 결과가 이상하면 원래 블록을 그대로 돌려준다 — 던지지 않는다.
 */
export async function tidyBlocks(blocks: ParsedBlock[]): Promise<TidyOutcome> {
  const targets = blocks
    .map((b, index) => ({ index, body: b.body }))
    .filter(({ index, body }) => blocks[index].kind === "ad" && isLongProse(body));

  if (targets.length === 0) return { blocks, dropped: 0 };

  let parsed: unknown;
  try {
    parsed = await generateJson(SYSTEM, JSON.stringify(targets), SCHEMA);
  } catch {
    // 나누기는 이미 끝났다. 다듬기가 안 됐다고 결과 전체를 버리지는 않는다.
    return { blocks, dropped: 0 };
  }

  if (!Array.isArray(parsed)) return { blocks, dropped: 0 };

  const wanted = new Set(targets.map((t) => t.index));
  const out = blocks.map((b) => ({ ...b }));
  let dropped = 0;

  for (const item of parsed) {
    const o = (item ?? {}) as { index?: unknown; body?: unknown };
    const index = typeof o.index === "number" ? o.index : -1;
    // 시키지 않은 칸을 고쳐 왔거나 한 칸을 두 번 보냈으면 무시한다
    if (!wanted.delete(index) || typeof o.body !== "string") continue;

    const block = out[index];
    const tidy = flowBody(normalize(o.body));
    if (!tidy || tidy === flowBody(block.body)) continue;

    if (!keepsContent(block.body, tidy)) {
      dropped++;
      continue;
    }
    block.tidy = tidy;
  }

  return { blocks: out, dropped };
}
