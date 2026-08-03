/**
 * 다듬은 글에 원문 내용이 그대로 남아 있는지 기계로 대조한다.
 *
 * 다듬기는 글자를 바꾸는 일이라 anchor.ts 처럼 한 글자씩 맞춰볼 수 없다.
 * 대신 "내용이 줄었는가"만 네 가지로 재고, 하나라도 걸리면 그 다듬기는 버린다.
 * 사람이 눈으로 승인하기 전에 거는 1차 그물이다 — 마지막 판단은 사람이 한다.
 */

/** 글자와 숫자만 남긴다. 줄바꿈·문장부호는 내용이 아니므로 견줄 때 뺀다. */
export function contentChars(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, "");
}

/** 줄머리 번호와 글머리 기호는 내용이 아니다 — 다듬으면서 `1.`이 `-`로 바뀔 수 있다 */
function stripMarkers(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*▶▷▪•·※◆◇○●])\s*/, ""))
    .join("\n");
}

function numberCounts(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [n] of stripMarkers(s).matchAll(/\d+/g)) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}

/** 원문의 두 글자 조각이 다듬은 글에 얼마나 남아 있는지 */
function bigramCoverage(a: string, b: string): number {
  if (a.length < 2) return b.includes(a) ? 1 : 0;

  const seen = new Set<string>();
  for (let i = 0; i + 1 < b.length; i++) seen.add(b.slice(i, i + 2));

  let hit = 0;
  for (let i = 0; i + 1 < a.length; i++) {
    if (seen.has(a.slice(i, i + 2))) hit++;
  }
  return hit / (a.length - 1);
}

/** 문장 끝(…다. …요.)과 줄바꿈에서 자른다. 마침표를 안 찍고 오는 원문이 많아 어미도 함께 본다. */
const SENTENCE_BREAK = /[.!?…\n]+|(?<=[다요])\s+/;

/**
 * 원문의 문장이 하나라도 통째로 사라지지 않았는지 본다.
 *
 * 전체 분량만 재면 짧은 문장 하나가 빠져도 티가 나지 않는다.
 * 문장마다 따로 견주면 빠진 문장은 곧바로 0에 가깝게 나온다.
 * 말을 다듬느라 어미가 바뀌어도 이름·장소·명사는 남으므로 절반 넘게는 겹친다.
 */
function everySentenceSurvives(original: string, tidied: string): boolean {
  const b = contentChars(tidied);

  return original
    .split(SENTENCE_BREAK)
    .map(contentChars)
    // 너무 짧은 조각은 흔한 글자만으로도 우연히 맞아 판단에 쓰지 않는다
    .filter((s) => s.length >= 8)
    .every((s) => bigramCoverage(s, b) >= 0.6);
}

/** 다듬은 글이 원문 내용을 지키고 있으면 true */
export function keepsContent(original: string, tidied: string): boolean {
  const a = contentChars(original);
  const b = contentChars(tidied);
  if (!a || !b) return false;

  // 1. 분량 — 요약해 버렸으면 짧아지고, 없던 말을 지어냈으면 길어진다
  const ratio = b.length / a.length;
  if (ratio < 0.85 || ratio > 1.25) return false;

  // 2. 숫자 — 날짜·시간·금액·연락처가 여기 들어 있어 하나도 틀리면 안 된다
  const before = numberCounts(original);
  const after = numberCounts(tidied);
  for (const [n, c] of before) if ((after.get(n) ?? 0) < c) return false;
  for (const n of after.keys()) if (!before.has(n)) return false;

  // 3. 두 글자 조각 — 글 전체가 뭉텅이로 줄었으면 여기서 걸린다
  if (bigramCoverage(a, b) < 0.8) return false;

  // 4. 문장 하나하나 — 짧은 문장이 슬쩍 빠진 것은 여기서 걸린다
  return everySentenceSurvives(original, tidied);
}
