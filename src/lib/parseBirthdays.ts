/**
 * 생일 명단 붙여넣기 파서
 *
 * 명단은 해마다, 적는 사람마다 모양이 다르게 온다. 그 차이를 여기서 흡수한다.
 *
 *   홍길동   3월 17일          홍길동, 3-17           - 홍길동 (3월 17일)
 *   홍길동	3/17              홍길동 1988.3.17       3월 17일 홍길동
 *
 * 태어난 해는 어떤 모양으로 와도 버린다. 주보에 쓰이지 않고, 나이를 특정할 수 있는
 * 값이라 읽는 자리에서 떨궈 놓는 편이 안전하다.
 *
 * 읽어내지 못한 줄은 조용히 버리지 않고 그대로 돌려준다. 명단은 한 사람이 빠지면
 * 그 사람만 서운해지는 자료라, 무엇이 빠졌는지 눈으로 보고 손볼 수 있어야 한다.
 */

export interface BirthdayEntry {
  name: string;
  /** 1~12 */
  month: number;
  /** 1~31 */
  day: number;
}

export interface ParsedBirthdays {
  entries: BirthdayEntry[];
  /** 날짜를 찾지 못했거나 없는 날짜라서 넘긴 줄 */
  unread: string[];
}

/** 2월은 29일까지 받는다 — 윤년에 태어난 사람이 있다 */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 이름 없이 항목만 적힌 머리글 줄 */
const HEADER = /^(?:이름|성명|성함)\s*[,\t|]?\s*(?:생일|생년월일|birth\w*)?\s*$/i;

/** 줄 앞머리의 목록 기호 */
const BULLET = /^(?:\d+[.)]|[-*▶▷▪•·※◆◇○●])\s*/;

/**
 * 날짜로 읽을 수 있는 모양들. 위에서부터 차례로 맞춰 본다.
 * 앞자리가 연도인 것(3개짜리)을 두 자리짜리보다 먼저 본다 —
 * 먼저 보지 않으면 `1988.3.17`에서 `1988.3`을 날짜로 잘못 집는다.
 */
const PATTERNS: { re: RegExp; pick: (m: RegExpMatchArray) => [number, number] }[] = [
  // 1988년 3월 17일 / 3월 17일 / 3월17
  { re: /(?:\d{2,4}\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일?/g, pick: (m) => [+m[1], +m[2]] },
  // 1988.3.17 / 88-3-17 / 2003/03/17
  { re: /(?:^|[^\d])(\d{4}|\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/g, pick: (m) => [+m[2], +m[3]] },
  // 3.17 / 3-17 / 3/17
  { re: /(?:^|[^\d])(\d{1,2})[.\-/](\d{1,2})(?!\d)/g, pick: (m) => [+m[1], +m[2]] },
  // 19880317
  { re: /(?:^|[^\d])\d{4}(\d{2})(\d{2})(?!\d)/g, pick: (m) => [+m[1], +m[2]] },
  // 880317
  { re: /(?:^|[^\d])\d{2}(\d{2})(\d{2})(?!\d)/g, pick: (m) => [+m[1], +m[2]] },
  // 0317
  { re: /(?:^|[^\d])(\d{2})(\d{2})(?!\d)/g, pick: (m) => [+m[1], +m[2]] },
];

function validDate(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

/**
 * 날짜를 들어낸 나머지에서 이름을 추린다. '집사'·'청년' 같은 호칭은 적힌 대로 남긴다.
 *
 * 숫자만으로 된 덩어리는 떼어 낸다. 명단에는 전화번호나 태어난 해가 함께 적혀 오는 일이
 * 잦은데, 그것이 이름에 붙은 채 남으면 주보에 그대로 인쇄된다.
 */
function cleanName(rest: string): string {
  return rest
    .replace(/[(){}[\]<>]/g, " ")
    .replace(/[,:;|·ㆍ]/g, " ")
    .replace(/\s*(?:생일|생년월일)\s*/g, " ")
    .split(/\s+/)
    .filter((token) => token && !/^[\d.\-/]+$/.test(token))
    .join(" ")
    .trim();
}

/**
 * 한 덩어리(한 사람)를 읽는다. 못 읽으면 null.
 *
 * 한 모양에서 처음 걸린 자리만 보고 포기하지 않는다. 전화번호처럼 날짜가 아닌 숫자가
 * 앞에 섞여 오면 거기서 먼저 걸리는데, 그 하나 때문에 뒤에 있는 진짜 생일을 놓치게 된다.
 */
function readOne(chunk: string): BirthdayEntry | null {
  const line = chunk.replace(BULLET, "").trim();
  if (!line) return null;

  for (const { re, pick } of PATTERNS) {
    for (const m of line.matchAll(re)) {
      const [month, day] = pick(m);
      if (!validDate(month, day)) continue;

      const name = cleanName(line.slice(0, m.index) + " " + line.slice(m.index + m[0].length));
      if (!name) continue;

      return { name, month, day };
    }
  }

  return null;
}

export function parseBirthdays(text: string): ParsedBirthdays {
  const entries: BirthdayEntry[] = [];
  const unread: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || HEADER.test(line)) continue;

    // 한 줄에 여러 명이 '|'나 쉼표로 이어 붙어 오기도 한다.
    // 쉼표는 '홍길동, 3월 17일'처럼 이름과 날짜 사이에도 쓰이므로,
    // 나눈 조각이 저마다 날짜를 갖고 있을 때만 여러 명으로 본다.
    const parts = line.includes("|") ? line.split("|") : splitByComma(line);

    for (const part of parts) {
      const chunk = part.trim();
      if (!chunk) continue;

      const entry = readOne(chunk);
      if (!entry) {
        unread.push(chunk);
        continue;
      }

      const key = `${entry.name}/${entry.month}/${entry.day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }

  return { entries, unread };
}

/** 쉼표로 나눠 모든 조각이 날짜를 갖고 있으면 여러 명, 아니면 한 명으로 둔다 */
function splitByComma(line: string): string[] {
  if (!line.includes(",")) return [line];
  const parts = line.split(",");
  return parts.every((p) => readOne(p) !== null) ? parts : [line];
}

/** 줄바꿈이 일어나도 이름과 날짜가 떨어지지 않게 사이를 붙여 둔다 */
const NBSP = " ";

/** '홍길동 3월 17일' */
export function formatEntry(e: BirthdayEntry): string {
  return `${e.name}${NBSP}${e.month}월${NBSP}${e.day}일`;
}

/** 한 줄에 세우는 사람 수 */
export const PER_LINE = 3;

/**
 * 한 달치를 날짜순으로 세워 줄로 나눈다.
 *
 *   홍길동 3월 7일 | 김철수 3월 12일 | 이영희 3월 15일
 *   박민수 3월 18일 | 정하늘 3월 21일
 *
 * 글자 폭에 맡겨 저절로 넘기지 않고 사람 수로 끊는다. 이름 길이가 제각각이라
 * 폭에 맡기면 줄마다 인원이 들쭉날쭉해져 명단이 흐트러져 보인다.
 */
export function formatMonth(entries: BirthdayEntry[]): string[] {
  const sorted = [...entries].sort(
    (a, b) => a.month - b.month || a.day - b.day || a.name.localeCompare(b.name, "ko"),
  );

  const lines: string[] = [];
  for (let i = 0; i < sorted.length; i += PER_LINE) {
    lines.push(sorted.slice(i, i + PER_LINE).map(formatEntry).join(" | "));
  }
  return lines;
}

/**
 * 읽어낸 사람들을 달별로 갈라 'YYYY-MM' → 명단 으로 묶는다.
 *
 * 한 달치만 오는 것이 보통이지만 몇 달치가 한꺼번에 오기도 한다.
 * 그때 3월 것만 남기고 버리면 나머지를 다시 받아야 하므로, 온 것은 모두 제자리에 넣는다.
 * 연도는 지금 편집 중인 달을 따른다 — 명단에는 연도가 적혀 오지 않기 때문이다.
 */
export function groupByMonth(
  entries: BirthdayEntry[],
  baseYm: string,
): Record<string, BirthdayEntry[]> {
  const year = baseYm.slice(0, 4);
  const out: Record<string, BirthdayEntry[]> = {};

  for (const e of entries) {
    const key = `${year}-${String(e.month).padStart(2, "0")}`;
    (out[key] ??= []).push(e);
  }
  return out;
}
