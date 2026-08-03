/**
 * 광고 텍스트 붙여넣기 파서
 *
 * 목사님이 구글 문서로 올린 광고 전문을 통째로 붙여넣으면 블록 배열로 변환한다.
 * 우선순위
 *   1. <...> [...] 【...】 로 감싼 줄 → 블록 제목
 *   2. 빈 줄 → 블록 구분자
 *   3. 1. - * ▶ 로 시작하는 줄 → 제목 후보
 *   4. 어느 것도 안 맞으면 첫 줄을 제목으로 가정 (confident=false → 사용자 확인 필요)
 *
 * 나뉜 덩어리는 다시 광고·주요일정·본문 말씀으로 갈린다. 원문에 섞여 오는
 * 주요일정과 본문 말씀도 붙여넣기 한 번으로 제자리에 들어가게 하기 위함이다.
 */

export type ParsedKind = "ad" | "schedule" | "sermon";

export interface ParsedBlock {
  kind: ParsedKind;
  title: string;
  body: string;
  /** 규칙에 확실히 들어맞아 파싱했는지. false면 UI에서 확인을 권한다. */
  confident: boolean;
  /**
   * 긴 줄글이라 AI가 읽기 좋게 다듬은 본문 (lib/ai/tidy.ts).
   * 원문 `body`는 그대로 두고 여기에만 담는다 — 사람이 승인해야 쓰인다.
   */
  tidy?: string;
}

const BRACKET_TITLE = /^[<〈《【[(]\s*.*\S.*\s*[>〉》】\])]$/;
const BULLET = /^(?:\d+[.)]|[-*▶▷▪•·※◆◇○●])\s*\S/;

/** 제목을 감싼 괄호를 벗긴다. 화면에는 다시 <>를 씌워 보여준다. */
export function stripBrackets(title: string): string {
  return title
    .trim()
    .replace(/^[<〈《【[(]\s*/, "")
    .replace(/\s*[>〉》】\])]$/, "")
    .trim();
}

const SERMON_TITLE = /본문\s*말씀|말씀\s*본문|설교/;
const SCHEDULE_TITLE = /주요\s*일정|일정\s*안내|앞으로의\s*일정/;
/** '제목:' '본문:' 처럼 앞머리를 붙인 줄 */
const LABELED = (label: string) => new RegExp(`^\\s*${label}\\s*[:：]\\s*(.*)$`, "m");
const SERMON_SUBJECT = LABELED("제목");
const SERMON_VERSE = LABELED("(?:본문|말씀)");
/** '8월 3일(월)' '8/3' 같은 날짜가 시작되는 자리 */
const DATE_START = /\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*일\s*\(|\d{1,2}\s*[./]\s*\d{1,2}/;

/** 덩어리 하나가 광고인지, 주요일정인지, 본문 말씀인지 가른다. */
export function classify(title: string, body: string): ParsedKind {
  const t = stripBrackets(title);
  if (SERMON_TITLE.test(t)) return "sermon";
  if (SCHEDULE_TITLE.test(t)) return "schedule";

  // 제목이 없어도 '제목:'과 '본문:'이 함께 있으면 설교 안내로 본다
  if (SERMON_SUBJECT.test(body) && SERMON_VERSE.test(body)) return "sermon";

  // 모든 줄에 날짜가 붙어 있으면 일정 목록으로 본다
  const lines = bodyLines(body);
  if (lines.length >= 2 && lines.every((l) => DATE_START.test(l))) return "schedule";

  return "ad";
}

function bodyLines(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*▶▷▪•·※◆◇○●])\s*/, "").trim())
    .filter(Boolean);
}

/** 본문 말씀 덩어리에서 설교 제목과 성경 본문을 뽑는다. */
export function parseSermon(body: string): { title: string; verse: string } {
  const subject = SERMON_SUBJECT.exec(body)?.[1]?.trim() ?? "";
  const verse = SERMON_VERSE.exec(body)?.[1]?.trim() ?? "";

  // 앞머리 없이 두 줄만 적어 온 경우 — 첫 줄이 제목, 둘째 줄이 본문
  if (!subject && !verse) {
    const lines = bodyLines(body);
    return { title: lines[0] ?? "", verse: lines[1] ?? "" };
  }
  return { title: subject, verse };
}

/** 주요일정 덩어리에서 '행사명 + 날짜' 목록을 뽑는다. */
export function parseScheduleItems(body: string): { name: string; date: string }[] {
  return bodyLines(body).map((line) => {
    const at = DATE_START.exec(line);
    if (!at || at.index === 0) return { name: line, date: "" };
    return {
      name: line.slice(0, at.index).replace(/[-–—:：]\s*$/, "").trim(),
      date: line.slice(at.index).trim(),
    };
  });
}

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

/**
 * 광고 본문을 되도록 한 줄로 이어 붙인다.
 *
 * 원문은 문장 중간에도 줄이 끊겨 오는 일이 많은데, 그대로 두면 짧은 줄이 겹겹이 쌓여
 * 한 페이지에 넉넉히 들어갈 광고가 다음 장으로 넘어가고 페이지마다 여백이 들쭉날쭉해진다.
 * 뜻이 담긴 줄바꿈 — 빈 줄(문단 구분)과 글머리 기호로 시작하는 줄(목록) — 만 남긴다.
 */
export function flowBody(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((para) => {
      const out: string[] = [];
      for (const raw of para.split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        // 목록 항목은 제 줄을 지키고, 나머지는 앞줄에 이어 붙인다
        if (out.length === 0 || BULLET.test(line)) out.push(line);
        else out[out.length - 1] += ` ${line}`;
      }
      return out.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

function tidyBody(lines: string[]): string {
  return lines
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** 덩어리 하나를 종류까지 정해 블록으로 만든다 */
function mk(title: string, body: string, confident: boolean): ParsedBlock {
  return { kind: classify(title, body), title, body, confident };
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
    if (preface) blocks.push(mk("", preface, false));

    titleIdx.forEach((start, n) => {
      const end = n + 1 < titleIdx.length ? titleIdx[n + 1] : lines.length;
      blocks.push(mk(lines[start].trim(), tidyBody(lines.slice(start + 1, end)), true));
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
      return mk(first, tidyBody(cl.slice(1)), true);
    }

    // 규칙 4 — 짧은 첫 줄이면 제목으로 가정 (확인 필요)
    if (cl.length > 1 && first.length <= 24) {
      return mk(first, tidyBody(cl.slice(1)), false);
    }

    return mk("", chunk, false);
  });
}

export const KIND_LABEL: Record<ParsedKind, string> = {
  ad: "광고",
  schedule: "주요일정",
  sermon: "본문 말씀",
};

/** 파싱 결과 요약 — UI 안내문에 사용 */
export function summarize(blocks: ParsedBlock[]): string {
  if (blocks.length === 0) return "변환할 내용이 없습니다.";

  const ads = blocks.filter((b) => b.kind === "ad").length;
  const extra = (["schedule", "sermon"] as const)
    .filter((k) => blocks.some((b) => b.kind === k))
    .map((k) => KIND_LABEL[k]);

  const base = `변환 결과 — ${[ads > 0 ? `광고 ${ads}개` : "", ...extra].filter(Boolean).join(" · ")}`;
  const unsure = blocks.filter((b) => !b.confident).length;
  return unsure
    ? `${base}. 그중 ${unsure}개는 제목 구분이 확실하지 않아 확인이 필요합니다.`
    : `${base}.`;
}
