/**
 * 광고 텍스트 붙여넣기 파서
 *
 * 목사님이 구글 문서로 올린 광고 전문을 통째로 붙여넣으면 블록 배열로 변환한다.
 * 우선순위
 *   1. <...> [...] 【...】 로 감싼 줄 → 블록 제목
 *   2. 빈 줄 → 블록 구분자
 *   3. 1. - * ▶ 로 시작하는 줄 → 제목 후보
 *   4. 어느 것도 안 맞으면 첫 줄을 제목으로 가정 (confident=false → 사용자 확인 필요)
 */

export interface ParsedBlock {
  title: string;
  body: string;
  /** 규칙에 확실히 들어맞아 파싱했는지. false면 UI에서 확인을 권한다. */
  confident: boolean;
}

const BRACKET_TITLE = /^[<〈《【[(]\s*.*\S.*\s*[>〉》】\])]$/;
const BULLET = /^(?:\d+[.)]|[-*▶▷▪•·※◆◇○●])\s*\S/;

/** 구글 문서에서 복사할 때 딸려오는 특수 공백·서식 정리 */
export function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[  -   　]/g, " ") // 줄바꿈 없는 공백류
    .replace(/[​-‍﻿]/g, "") // 폭 없는 문자
    .replace(/\t/g, " ")
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tidyBody(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function parseAdText(raw: string): ParsedBlock[] {
  const text = normalize(raw);
  if (!text) return [];

  const lines = text.split("\n");
  const titleIdx: number[] = [];
  lines.forEach((line, i) => {
    if (BRACKET_TITLE.test(line.trim())) titleIdx.push(i);
  });

  // 규칙 1 — 괄호 제목이 하나라도 있으면 그것을 기준으로 자른다
  if (titleIdx.length > 0) {
    const blocks: ParsedBlock[] = [];

    const preface = tidyBody(lines.slice(0, titleIdx[0]));
    if (preface) blocks.push({ title: "", body: preface, confident: false });

    titleIdx.forEach((start, n) => {
      const end = n + 1 < titleIdx.length ? titleIdx[n + 1] : lines.length;
      blocks.push({
        title: lines[start].trim(),
        body: tidyBody(lines.slice(start + 1, end)),
        confident: true,
      });
    });

    return blocks.filter((b) => b.title || b.body);
  }

  // 규칙 2 — 빈 줄로 덩어리를 나눈다
  const chunks = text
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  return chunks.map((chunk) => {
    const cl = chunk.split("\n");
    const first = cl[0].trim();

    // 규칙 3 — 글머리 기호로 시작하면 제목으로 본다
    if (cl.length > 1 && BULLET.test(first)) {
      return { title: first, body: tidyBody(cl.slice(1)), confident: true };
    }

    // 규칙 4 — 짧은 첫 줄이면 제목으로 가정 (확인 필요)
    if (cl.length > 1 && first.length <= 24) {
      return { title: first, body: tidyBody(cl.slice(1)), confident: false };
    }

    return { title: "", body: chunk, confident: false };
  });
}

/** 파싱 결과 요약 — UI 안내문에 사용 */
export function summarize(blocks: ParsedBlock[]): string {
  if (blocks.length === 0) return "변환할 내용이 없습니다.";
  const unsure = blocks.filter((b) => !b.confident).length;
  const base = `광고 ${blocks.length}개로 변환됩니다.`;
  return unsure
    ? `${base} 그중 ${unsure}개는 제목 구분이 확실하지 않아 확인이 필요합니다.`
    : base;
}
