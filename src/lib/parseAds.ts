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
  /**
   * 원문에 제목이 없어 AI가 지어 붙인 제목 (lib/ai/gemini.ts).
   * 원문 글자가 아니므로 `title`과 섞지 않는다 — 화면에서 따로 표시한다.
   */
  suggestedTitle?: string;
}

/**
 * 괄호로 감싼 제목 줄. 소괄호는 넣지 않는다 — '(섬김날짜: 9/3 …)' '(문의: …)'처럼
 * 광고 안의 덧붙임 말에 쓰여, 제목으로 읽으면 그 뒤 광고들이 통째로 엉킨다.
 */
const BRACKET_TITLE = /^[<〈《【[]\s*.*\S.*\s*[>〉》】\]]$/;
const BULLET = /^(?:\d+[.)]|[-*▶▷▪•·※◆◇○●])\s*\S/;

/** 제목을 감싼 괄호를 벗긴다. 화면에는 다시 <>를 씌워 보여준다. */
export function stripBrackets(title: string): string {
  return title
    .trim()
    .replace(/^[<〈《【[(]\s*/, "")
    .replace(/\s*[>〉》】\])]$/, "")
    .trim();
}

/**
 * 설교 안내 덩어리의 소제목 — '본문 말씀' '설교' '주일 설교' '금주의 말씀' '<8월 3일 말씀>'.
 * '새벽설교' 같은 광고 제목까지 끌어들이지 않게 '설교'·'말씀' 앞에 올 수 있는 말을 정해 둔다.
 */
const SERMON_TITLE =
  /본문\s*말씀|말씀\s*본문|^(?:(?:주일|금주의?|오늘의?|이번\s*주|\d{1,2}\s*월\s*\d{1,2}\s*일(?:\s*주일)?)\s*)?(?:설교|말씀)(?:\s*(?:말씀|안내))?$/;
const SCHEDULE_TITLE = /주요\s*일정|일정\s*안내|앞으로의\s*일정/;
/**
 * '제목:' '본문:' 처럼 앞머리를 붙인 줄.
 * 쌍점 뒤는 같은 줄에서만 찾는다 — '본문:' 뒤가 비어 있을 때 다음 줄 '제목:'을 본문으로 읽지 않게.
 */
const LABELED = (label: string) => new RegExp(`^[ \\t]*(?:${label})[ \\t]*[:：][ \\t]*(.*)$`, "m");
/** '제목:' '설교 제목:' '설교제목:' '말씀 제목:' — '설교자:'는 사람 이름이라 들지 않는다 */
const SERMON_SUBJECT = LABELED("(?:설교|말씀)?\\s*제목");
/** '본문:' '말씀:' '본문 말씀:' '설교 본문:' '성경 본문:' '성경:' */
const SERMON_VERSE = LABELED("(?:(?:설교|성경)\\s*)?(?:본문|말씀)(?:\\s*말씀)?|성경");
/**
 * 앞머리 없이 적힌 줄이 성경 구절처럼 생겼는지 — '벧전 2:9' '이사야 43장 7절' '롬 3:10-18절'.
 * '오후 7:30' '주일 11:00' 같은 시각은 생김새가 같아 앞말로 걸러낸다.
 */
const VERSE_LIKE =
  /^(?!(?:오전|오후|낮|저녁|밤|새벽|아침|주일|매주|[월화수목금토일]요일)\s*\d)[가-힣A-Za-z]{1,8}\s*\d{1,3}\s*(?:[:：]|장)\s*\d{1,3}/;

/** 앞머리 없이 '구절 한 줄 + 설교 제목 한 줄'로만 적어 온 설교 안내인지 (예: 갈라디아서 5:22~26 / 팀웍을 …) */
function isBareSermon(title: string, body: string): boolean {
  const head = SERMON_TITLE.test(stripBrackets(title)) ? "" : title;
  const lines = [head, ...body.split("\n")].map((l) => l.trim()).filter(Boolean);
  return lines.length === 2 && lines.some((l) => VERSE_LIKE.test(l)) && lines.every((l) => l.length <= 40);
}
/** '…있습니다.' '…바랍니다'처럼 문장으로 맺은 줄 */
const SENTENCE_END = /[다요]\.?$/;

/** 제목·머리줄로 쓸 만한 한 줄 — 짧고, 문장이나 쉼표로 끝나지 않는다 */
function isHeadingText(text: string, max: number): boolean {
  const t = text.trim();
  return !!t && !t.includes("\n") && t.length <= max && !SENTENCE_END.test(t) && !/[.!?,]$/.test(t);
}

const DAY_NAME = String.raw`(?:주일|[월화수목금토일](?:요일)?)`;
/** 날짜 뒤에 붙는 요일 괄호 — '(수)' '(주일)' '(토요일)' '(토-주일)' */
const WEEKDAY = String.raw`\(\s*${DAY_NAME}(?:\s*[-–~]\s*${DAY_NAME})?\s*\)`;
/** 날짜 뒤에 바로 붙는 시각 — '5월 2일(토) 오후 3시' */
const CLOCK = String.raw`(?:오전|오후|낮|저녁|밤|새벽)\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분|\s*반)?`;
/**
 * 날짜 한 덩어리. 긴 것부터 본다 — '9월 13일'을 '9월'로 끊어 읽지 않게.
 * '8월 1-2일'처럼 달 하나에 날짜 둘을 붙인 기간도 여기서 통째로 잡는다.
 */
const DATE_ATOM = String.raw`(?:\d{1,2}\s*월\s*\d{1,2}\s*[-–~]\s*\d{1,2}\s*일|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*[./]\s*\d{1,2}|\d{1,2}\s*월|\d{1,2}\s*일)`;
/**
 * 줄 안에서 날짜가 차지한 구간 전부.
 * '9월 24일(목)-26일(토)' 처럼 이어진 기간도 한 덩어리로 잡아야
 * 뒤쪽 '26일(토)'이 행사명에 끌려 들어가지 않는다.
 */
const DATE_RUN = new RegExp(
  `${DATE_ATOM}(?:\\s*${WEEKDAY})?(?:\\s*[-–—~∼]\\s*${DATE_ATOM}(?:\\s*${WEEKDAY})?)*(?:\\s*${CLOCK})?`,
);

/**
 * '날짜 + 행사명' 한 줄인지. 날짜가 줄 맨 앞이나 맨 끝에 붙어 있어야 한다 —
 * '주차 안내: 10/26부터 공사'처럼 문장 가운데 날짜가 든 줄은 일정이 아니다.
 */
function isScheduleLine(line: string): boolean {
  const t = stripListMarker(line);
  const at = DATE_RUN.exec(t);
  if (!at || SENTENCE_END.test(t) || t.length > 50) return false;
  return at.index === 0 || at.index + at[0].length === t.length;
}

/** 덩어리 하나가 광고인지, 주요일정인지, 본문 말씀인지 가른다. */
export function classify(title: string, body: string): ParsedKind {
  const t = stripBrackets(title);
  if (SERMON_TITLE.test(t)) return "sermon";
  if (SCHEDULE_TITLE.test(t)) return "schedule";

  // 제목이 없어도 '제목:'과 '본문:'이 함께 있으면 설교 안내로 본다.
  // '본문: …' 줄이 먼저 오면 그 줄이 제목 자리로 잘려 오므로 제목 자리도 함께 본다.
  const all = `${title}\n${body}`;
  if (SERMON_SUBJECT.test(all) && SERMON_VERSE.test(all)) return "sermon";
  if (isBareSermon(title, body)) return "sermon";

  // 모든 줄에 날짜가 붙어 있으면 일정 목록으로 본다.
  // '…9월 13일(주일) 있습니다.'처럼 문장으로 끝나는 줄은 날짜가 들었어도 광고다.
  const lines = bodyLines(body);
  if (lines.length >= 2 && lines.every(isScheduleLine)) return "schedule";

  return "ad";
}

/** 줄머리 번호·글머리 기호 ('9.' '▶')를 떼어낸다 */
export function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:\d+[.)]|[-*▶▷▪•·※◆◇○●])\s*/, "").trim();
}

function bodyLines(body: string): string[] {
  return body.split("\n").map(stripListMarker).filter(Boolean);
}

/**
 * 본문 말씀 덩어리에서 설교 제목과 성경 본문을 뽑는다.
 *
 * 덩어리의 제목 자리도 함께 본다. '설교 제목: …' 줄은 짧아서
 * 제목 자리로 잘려 들어오는 일이 잦은데, 본문만 보면 설교 제목을 놓친다.
 */
export function parseSermon(title: string, body: string): { title: string; verse: string } {
  const all = [title, body].filter((s) => s.trim()).join("\n");
  const subject = SERMON_SUBJECT.exec(all);
  const verse = SERMON_VERSE.exec(all);
  // 앞머리가 하나라도 있으면 그것만 믿는다 — '본문:' '제목:'만 적고 비워 둔 주도 있다
  if (subject || verse) return { title: subject?.[1]?.trim() ?? "", verse: verse?.[1]?.trim() ?? "" };

  // 앞머리 없이 적어 온 경우 — 구절처럼 생긴 줄이 본문, 나머지 첫 줄이 제목.
  // 제목 자리는 본문이 한 줄뿐일 때만 내용으로 본다('갈라디아서 5:22~26' / '팀웍을 …').
  // 본문에 두 줄이 다 있으면 제목 자리는 '<8월 3일 말씀>' 같은 소제목일 뿐이다.
  const inBody = bodyLines(body);
  const lines = SERMON_TITLE.test(stripBrackets(title)) || inBody.length >= 2 ? inBody : bodyLines(all);
  const at = lines.findIndex((l) => VERSE_LIKE.test(l));
  if (at < 0) return { title: lines[0] ?? "", verse: lines[1] ?? "" };
  return { title: lines.find((_, i) => i !== at) ?? "", verse: lines[at] };
}

/** '10월 18일 청년부 광고' 처럼 원문 맨 위에 붙는 문서 제목 한 줄 */
const DOC_TITLE = /^(?:\d{1,2}\s*월\s*\d{1,2}\s*일\s*)?\S.{0,24}(?:광고|소식|주보)$/;

function isDocTitle(b: ParsedBlock): boolean {
  const text = [b.title, b.body].map((s) => s.trim()).filter(Boolean);
  return text.length === 1 && !text[0].includes("\n") && DOC_TITLE.test(text[0]);
}

/** 제목으로 쓸 만한 한 줄 */
function isHeadingLine(text: string): boolean {
  return isHeadingText(text, 40);
}

/** 줄마다 짧은 덩어리 — 문단이 아니라 안내 항목 몇 줄 */
function isShortLines(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((l) => l.length <= 70);
}

function isScheduleHeading(b: ParsedBlock): boolean {
  return b.kind === "ad" && !b.title.trim() && SCHEDULE_TITLE.test(b.body.trim()) && isHeadingLine(b.body);
}

/** 제목 자리까지 포함해 모든 줄이 '날짜 + 행사명' 줄인지 */
function isDateLines(b: ParsedBlock): boolean {
  if (b.kind === "sermon") return false;
  const lines = [b.title, ...b.body.split("\n")].map(stripListMarker).filter(Boolean);
  return lines.length > 0 && lines.every(isScheduleLine);
}

function isStrayLabel(b: ParsedBlock): boolean {
  if (b.kind !== "ad" || b.title.trim()) return false;
  const lines = b.body.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length > 0 && lines.every((l) => LABEL_LINE.test(l));
}

/** 앞 덩어리가 제목 한 줄뿐이었으면 그 줄을 제목으로 올리고 뒤 내용을 본문으로 잇는다 */
function absorb(prev: ParsedBlock, body: string) {
  if (!prev.title && isHeadingLine(prev.body)) {
    prev.title = prev.body.trim();
    prev.body = "";
  }
  prev.body = [prev.body, body].filter((s) => s.trim()).join("\n");
}

/**
 * 나눈 덩어리를 주보에 넣을 모양으로 마무리한다. AI 결과와 규칙 결과에 모두 쓴다.
 * - 원문 맨 위의 문서 제목('10월 18일 청년부 광고')은 광고가 아니므로 뺀다.
 *   맨 앞 덩어리만 본다 — 가운데의 '선교부 소식' 같은 머리줄은 내용이다.
 * - 잇달아 나온 본문 말씀은 하나로 합친다. '설교 제목:'과 '본문:'이
 *   두 덩어리로 갈려 오면 어느 쪽에서도 제목·본문을 다 찾지 못한다.
 */
export function finishBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
  const out: ParsedBlock[] = [];
  blocks.forEach((b, i) => {
    if (i === 0 && isDocTitle(b)) return;
    const prev = out[out.length - 1];
    if (prev?.kind === "sermon" && b.kind === "sermon") {
      prev.body = [prev.body, b.title, b.body].filter((s) => s.trim()).join("\n");
      prev.confident &&= b.confident;
      return;
    }
    out.push({ ...b });
  });
  return out;
}

/**
 * 규칙 방식으로 자른 덩어리 중 빈 줄 때문에 잘못 갈린 것을 다시 잇는다.
 * AI는 이런 덩어리를 스스로 묶으므로 AI 결과에는 쓰지 않는다 — AI가 일부러 나눈 광고를 합치게 된다.
 * - 제목 없이 이름표 줄만 따로 떨어져 온 덩어리는 앞 광고에 붙인다.
 * - 머리줄 한 줄 뒤에 빈 줄로 띄운 짧은 줄들이 이어지면 한 광고로 모은다.
 * - '주요일정' 한 줄과 그 아래 날짜 줄, 중간에 끊긴 주요일정을 하나로 모은다.
 */
function rejoinRuleBlocks(blocks: ParsedBlock[]): ParsedBlock[] {
  const out: ParsedBlock[] = [];
  /** 머리줄 하나로 시작해 짧은 줄들을 모아 담는 중인 광고 */
  let gathering: ParsedBlock | null = null;
  for (const b of blocks) {
    const prev = out[out.length - 1];

    if (prev?.kind === "ad" && isStrayLabel(b)) {
      absorb(prev, b.body);
      gathering = prev;
      continue;
    }

    // (예: '대학청년부 여름 NWWC' / 빈 줄 / '주제는 …' / 빈 줄 / '7월 27일 …')
    // 모으던 중에 또 머리줄 한 줄이 오면 거기서 새 광고가 시작된 것이다
    const startsNew = isHeadingLine(b.body) && !LABEL_LINE.test(b.body.trim());
    const loose = b.kind === "ad" && !b.title.trim() && isShortLines(b.body) && !startsNew;
    if (prev?.kind === "ad" && loose) {
      const opens = !prev.title && isHeadingLine(prev.body) && !SCHEDULE_TITLE.test(prev.body);
      if (gathering === prev || opens) {
        absorb(prev, b.body);
        gathering = prev;
        continue;
      }
    }
    gathering = null;

    if (prev && isScheduleHeading(prev) && isDateLines(b)) {
      prev.kind = "schedule";
      prev.title = prev.body.trim();
      prev.body = [b.title, b.body].filter((s) => s.trim()).join("\n");
      continue;
    }
    if (prev?.kind === "schedule" && isDateLines(b)) {
      prev.body = [prev.body, b.title, b.body].filter((s) => s.trim()).join("\n");
      continue;
    }
    out.push(b);
  }
  return out;
}

export interface ScheduleParse {
  items: { name: string; date: string }[];
  /**
   * 원문이 '날짜 먼저 → 행사명' 차례로 적혀 있었는지.
   * 목사님이 올리는 주요일정은 날짜가 앞에 오는데, 주보에도 그 차례 그대로 찍어야
   * 원문과 견줘 읽을 수 있다.
   */
  dateFirst: boolean;
}

/** 날짜 앞뒤에 남은 줄표·쌍점을 털어낸다 */
function trimJoiner(s: string): string {
  return s.replace(/^\s*[-–—:：]\s*/, "").replace(/\s*[-–—:：]\s*$/, "").trim();
}

/** 주요일정 덩어리에서 '날짜 + 행사명' 목록을 뽑는다. 적힌 차례도 함께 알려준다. */
export function parseSchedule(body: string): ScheduleParse {
  let dateFirstCount = 0;
  let nameFirstCount = 0;

  const items = bodyLines(body).map((line) => {
    const at = DATE_RUN.exec(line);
    if (!at) return { name: line, date: "" };

    const head = line.slice(0, at.index).trim();
    const tail = line.slice(at.index + at[0].length).trim();
    if (head) nameFirstCount++;
    else dateFirstCount++;

    return {
      date: at[0].trim(),
      // 날짜가 줄 가운데 끼어 있으면 앞뒤 조각을 이어 행사명으로 삼는다
      name: trimJoiner([trimJoiner(head), trimJoiner(tail)].filter(Boolean).join(" ")),
    };
  });

  return { items, dateFirst: dateFirstCount > nameFirstCount };
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
 * '일시: …' '장소: …' '지원 문의: …' 처럼 이름표를 단 줄.
 * '1차 과정:'처럼 숫자로 시작해도 되지만, 숫자 바로 뒤의 쌍점은 '오후 6:30' '롬 3:10' 같은
 * 시각·구절이라 이름표로 보지 않는다.
 */
const LABEL_LINE = /^[\p{L}\p{N}][\p{L}\p{N}\s·()/]{0,11}(?<!\d)[:：]\s*\S/u;

/** '1차 집중 집회 (1박 2일)' 처럼 바로 아래 이름표 줄들을 묶는 짧은 머리줄 */
function isSubheading(line: string, next: string | undefined): boolean {
  return next !== undefined && LABEL_LINE.test(next) && isHeadingText(line, 24);
}

/** 줄이 문장·괄호·숫자로 맺혀 있어 다음 줄이 이어지는 말이 아닌지 */
const LINE_CLOSED = /[다요.!?)\]]$|\d$/;

/**
 * 광고 본문을 되도록 한 줄로 이어 붙인다.
 *
 * 원문은 문장 중간에도 줄이 끊겨 오는 일이 많은데, 그대로 두면 짧은 줄이 겹겹이 쌓여
 * 한 페이지에 넉넉히 들어갈 광고가 다음 장으로 넘어가고 페이지마다 여백이 들쭉날쭉해진다.
 * 뜻이 담긴 줄바꿈 — 빈 줄(문단 구분), 글머리 기호로 시작하는 줄(목록),
 * '일시:' 같은 이름표 줄과 그 위의 짧은 머리줄 — 만 남긴다.
 */
export function flowBody(body: string): string {
  return body
    .split(/\n\s*\n/)
    .map((para) => {
      const lines = para
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const out: string[] = [];
      // 목록·이름표 줄도 말이 덜 끝났으면('- 회비는 9만원이며' / '10일까지 …') 다음 줄을 이어 붙인다.
      // 말이 맺힌 이름표 줄 뒤에 오는 줄은 새 줄이다('방식: … (아웃팅)' / '자세한 내용은 …').
      let closed = true;
      /** 지금 쌓고 있는 줄이 목록·이름표 줄로 시작했는지 */
      let ownLine = false;
      lines.forEach((line, i) => {
        const sub = isSubheading(line, lines[i + 1]);
        const own = BULLET.test(line) || LABEL_LINE.test(line) || sub;
        // 이름표·목록 줄 뒤에 온 긴 줄은 끊긴 꼬리가 아니라 새 문장이다('예금주: …' / '재정 후원하실 분들은 …')
        const fresh = ownLine && line.length >= 40;
        if (closed || own || fresh) {
          out.push(line);
          ownLine = own;
        } else out[out.length - 1] += ` ${line}`;
        closed = sub || (ownLine && LINE_CLOSED.test(out[out.length - 1]));
      });
      return out.join("\n");
    })
    .filter(Boolean)
    // 이름표 줄 사이에 낀 빈 줄은 문단 구분이 아니라 원문 서식이다 — 붙여서 한 묶음으로 놓는다
    .reduce((acc, para) => {
      const last = acc.slice(acc.lastIndexOf("\n") + 1);
      return !acc ? para : acc + (LABEL_LINE.test(last) && LABEL_LINE.test(para) ? "\n" : "\n\n") + para;
    }, "");
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

/**
 * 빈 줄이 하나도 없는 원문에서 광고가 바뀌는 자리를 찾는다.
 * 짧고, 문장으로 끝나지 않고, 이름표 줄도 날짜 줄도 아닌 줄을 머리줄로 본다.
 */
function splitOnHeadings(lines: string[]): string {
  return lines
    .map((line, i) => {
      const t = line.trim();
      const before = lines[i - 1]?.trim() ?? "";
      // 앞줄이 말을 맺었어야 한다 — 문장 중간에 끊긴 줄('참석해 주시기')을 머리줄로 읽지 않게
      const after = SENTENCE_END.test(before) || LINE_CLOSED.test(before) || LABEL_LINE.test(before) || BULLET.test(before);
      const heading =
        i > 0 && after && isHeadingText(t, 24) && !LABEL_LINE.test(t) && !BULLET.test(t) && !isScheduleLine(t);
      return heading ? `\n${line}` : line;
    })
    .join("\n");
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

    return finishBlocks(rejoinRuleBlocks(blocks.filter((b) => b.title || b.body)));
  }

  // 규칙 2 — 빈 줄로 덩어리를 나눈다.
  // 빈 줄 없이 광고가 줄줄이 붙어 왔으면 머리줄로 보이는 줄 앞에 빈 줄을 넣고 나눈다.
  const chunks = (text.includes("\n\n") || lines.length < 8 ? text : splitOnHeadings(lines))
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  return finishBlocks(rejoinRuleBlocks(chunks.map((chunk) => {
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
  })));
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
