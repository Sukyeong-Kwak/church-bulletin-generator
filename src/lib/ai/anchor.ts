/**
 * AI가 돌려준 제목·내용을 원문에 다시 붙박는다.
 *
 * 모델이 보내온 글자를 그대로 쓰지 않는다. 공백을 뺀 원문에서 같은 자리를 찾아
 * "원문 조각"을 잘라 쓰기 때문에, 모델이 몰래 고쳐 쓴 글자는 결과에 남을 수 없다.
 * 자리를 못 찾거나 원문 일부를 통째로 버렸으면 ok=false —
 * 그때는 호출한 쪽이 규칙 파서 결과로 되돌린다.
 */

import type { ParsedBlock } from "@/lib/parseAds";
import type { AdPair } from "./types";

export interface AnchorResult {
  blocks: ParsedBlock[];
  /** 원문과 한 글자도 다르지 않게 맞춰졌는지 */
  ok: boolean;
  /** ok가 false인 이유 */
  reason?: string;
}

/** 글자·숫자가 하나라도 있으면 "버리면 안 되는 내용"으로 본다 (구분선·기호만 있는 줄은 버려도 됨) */
const MEANINGFUL = /[\p{L}\p{N}]/u;

const bare = (s: string) => s.replace(/\s+/g, "");

export function anchorBlocks(source: string, pairs: AdPair[]): AnchorResult {
  // 공백을 뺀 원문과, 그 글자가 원문에서 몇 번째였는지 대응표
  let flat = "";
  const at: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (!/\s/.test(source[i])) {
      flat += source[i];
      at.push(i);
    }
  }

  const blocks: ParsedBlock[] = [];
  let cursor = 0;
  let ok = true;
  let reason: string | undefined;

  /** flat의 cursor 이후에서 조각을 찾아 원문 그대로 잘라 온다 */
  const take = (piece: string): string | null => {
    const needle = bare(piece);
    if (!needle) return "";

    const idx = flat.indexOf(needle, cursor);
    if (idx < 0) return null;

    // 건너뛴 구간에 내용 글자가 있으면 AI가 원문을 흘린 것
    if (MEANINGFUL.test(flat.slice(cursor, idx))) {
      ok = false;
      reason ??= "AI가 원문 일부를 빠뜨렸습니다.";
    }

    cursor = idx + needle.length;
    return source.slice(at[idx], at[idx + needle.length - 1] + 1);
  };

  for (const pair of pairs) {
    if (!bare(pair.title) && !bare(pair.body)) continue;

    const title = take(pair.title);
    const body = title === null ? null : take(pair.body);

    if (title === null || body === null) {
      ok = false;
      reason ??= "AI 결과에 원문에 없는 글자가 섞였습니다.";
      break;
    }

    // 종류는 원문 글자가 아니라 분류일 뿐이라 모델 값을 그대로 쓴다
    blocks.push({ kind: pair.kind, title: title.trim(), body: body.trim(), confident: true });
  }

  if (ok && MEANINGFUL.test(flat.slice(cursor))) {
    ok = false;
    reason = "AI가 원문 뒷부분을 빠뜨렸습니다.";
  }

  if (blocks.length === 0 && MEANINGFUL.test(flat)) {
    ok = false;
    reason ??= "AI가 아무 내용도 나누지 못했습니다.";
  }

  return { blocks, ok, reason };
}
