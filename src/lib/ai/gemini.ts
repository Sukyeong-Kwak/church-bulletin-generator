/**
 * Google AI Studio(Gemini) 호출부 — 서버에서만 쓴다.
 *
 * 하는 일은 하나. 붙여넣은 광고 원문을 "제목 / 내용" 쌍으로 나누는 것.
 * 글자를 고치는 일은 절대 시키지 않으며, 실제로 고쳐 왔는지는
 * anchor.ts 가 원문과 대조해 걸러낸다. (모델 말을 믿지 않는다)
 * 원문에 제목이 없는 광고에는 제목을 지어 오게 하지만, 원문과 섞지 않고 따로 담는다.
 *
 * 나눈 뒤 긴 줄글을 읽기 좋게 다듬는 일은 tidy.ts 가 따로 맡는다.
 */

import { classify, stripBrackets, type ParsedKind } from "@/lib/parseAds";
import type { AdPair, ParseFailure } from "./types";

const KINDS: ParsedKind[] = ["ad", "schedule", "sermon"];

/**
 * 모델은 여기 한 줄만 고치면 바뀐다.
 * gemini-2.5-flash는 신규 사용자에게 닫혀 더 이상 쓸 수 없다.
 */
const MODEL = "gemini-3.6-flash";

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiError extends Error {
  constructor(
    readonly code: Exclude<ParseFailure, "bad-request">,
    message: string,
    /** Google이 돌려준 HTTP 상태. 응답을 받기 전에 실패했으면 없다. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

const SYSTEM = `너는 교회 주보의 광고 원문을 "제목"과 "내용"으로 나누고, 덩어리가 어떤 종류인지 고르고, 제목이 없는 광고에 제목을 지어주는 도구다.

규칙
1. 원문의 글자를 절대 고치지 마라. title과 body에는 맞춤법·띄어쓰기·문장부호·숫자·줄바꿈을 원문 그대로 옮긴다. 요약·의역·번역·윤문·추가·삭제 모두 금지다.
2. 원문에 나온 순서 그대로 출력한다. 순서를 바꾸거나 비슷한 광고를 합치지 마라.
3. 광고 한 덩어리에서 제목에 해당하는 줄은 title에, 나머지 줄은 body에 넣는다. 제목을 감싼 <>, [], 【】, () 같은 괄호와 ▶ · 1. 같은 글머리 기호도 원문에 있으면 그대로 둔다.
4. 제목은 덩어리 맨 위의 짧은 머리줄(대개 20자 안팎)이다. '…합니다.' '…있습니다.'처럼 문장으로 끝나는 줄은 제목이 아니라 body다. 제목이라고 볼 줄이 없으면 title은 빈 문자열로 두고 전부 body에 넣는다.
5. 원문의 모든 글자는 title이나 body 중 정확히 한 곳에 들어가야 한다. 어디에도 넣지 않고 버리는 글자가 있으면 안 된다.
6. 판단이 애매하면 나누지 말고 한 덩어리로 둬라. 지어내는 것보다 덜 나누는 편이 낫다.
   - 원문에 빈 줄이 하나도 없이 광고가 줄줄이 붙어 올 때도 있다. 그때는 짧은 머리줄(산상수훈, 주중 기도회 같은)이 나올 때마다 새 덩어리로 나눈다.
   - 반대로 한 광고 안에서 '일시:' '강사:' '문의:' 같은 이름표 줄이 빈 줄을 사이에 두고 이어지기도 한다. 이런 줄은 앞 광고의 내용이다 — 따로 떼지 말고 앞 덩어리 body에 이어 넣는다.
7. 덩어리마다 kind를 하나 고른다. 종류를 고를 뿐, 글자를 옮기는 방식은 똑같다.
   - "sermon": 그 주에 전할 설교를 알리는 덩어리. '설교 제목:' '제목:' '본문:' '설교자:' 같은 줄이 있거나, 설교 제목과 성경 구절(예: 벧전 2:9, 이사야 43장 7절)이 함께 적혀 있다. 설교 제목 줄·본문 줄·설교자 줄은 따로 나누지 말고 반드시 한 덩어리로 묶는다. 이때 title은 빈 문자열로 두고 그 줄들을 모두 body에 넣는다. '본문: 갈 5:22' '설교 본문: 요 14:16'처럼 앞머리가 달라도, 앞머리 없이 '갈라디아서 5:22~26 / 팀웍을 성공시키는 성령의 법'처럼 구절 한 줄과 제목 한 줄만 있어도, '본문:' '제목:'만 적고 내용이 비어 있어도 모두 "sermon"이다.
   - "schedule": 앞으로의 행사와 날짜를 늘어놓은 덩어리. '주요일정' 같은 제목이 붙었거나 줄마다 날짜와 행사명이 짝지어 있다. 어느 쪽이 앞에 오든(9월 13일(주일) 오이코스리더모임 / 오이코스리더모임 9월 13일(주일)) 같은 종류다.
   - "ad": 그 밖의 모든 광고. 어느 쪽인지 애매하면 "ad"를 고른다.
8. 원문 맨 위의 '10월 18일 청년부 광고' 같은 문서 제목 한 줄은 다른 덩어리에 붙이지 말고 그 줄 하나만으로 덩어리를 만든다. (title은 빈 문자열, body에 그 줄, kind는 "ad")
9. newTitle은 원문 글자가 아니라 네가 짓는 제목이다. 규칙 1은 newTitle에 해당하지 않는다.
   - kind가 "ad"이고 title이 빈 문자열인 덩어리에만 짓는다. 그 밖에는 빈 문자열로 둔다. 문서 제목 한 줄(규칙 8)에도 짓지 않는다.
   - 내용을 대표하는 2~12자 명사구로 짓는다. 다른 광고의 제목처럼 짧게 — 예: '결혼', '수학 교사 모집', '침례식', '가족운동회'.
   - 괄호·따옴표·마침표·글머리 기호를 붙이지 마라. 원문에 없는 날짜·이름을 지어 넣지 마라.
10. 설명·인사말·머리말 없이 JSON만 출력한다.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      kind: { type: "STRING", enum: ["ad", "schedule", "sermon"] },
      title: { type: "STRING" },
      body: { type: "STRING" },
      newTitle: { type: "STRING" },
    },
    required: ["kind", "title", "body", "newTitle"],
    propertyOrdering: ["kind", "title", "body", "newTitle"],
  },
} as const;

/** 지어 온 제목을 주보 제목 자리에 맞게 거른다. 쓸 수 없으면 빈 문자열. */
function cleanNewTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const t = stripBrackets(raw.replace(/\s+/g, " ")).replace(/^["'“‘]+|["'”’.。]+$/g, "").trim();
  return t.length >= 2 && t.length <= 20 ? t : "";
}

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string };
}

/**
 * 시킨 일을 JSON으로 받아 온다. 실패하면 GeminiError를 던진다.
 * 나누기(splitAdText)와 다듬기(tidy.ts)가 같은 통로를 쓴다.
 */
export async function generateJson(system: string, user: string, schema: unknown): Promise<unknown> {
  // '사용량이 몰렸다'는 503은 잠깐 뒤면 풀린다. 곧바로 규칙 방식으로 물러서지 않고 두 번 더 불러 본다.
  // 그 밖의 오류(모델 이름 틀림·시간 초과 등)는 다시 불러도 같아서 곧바로 물러선다.
  for (const wait of RETRY_WAITS) {
    try {
      return await callOnce(system, user, schema);
    } catch (e) {
      if (!(e instanceof GeminiError) || e.status !== 503) throw e;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return callOnce(system, user, schema);
}

/** 다시 부르기 전에 기다릴 시간(ms). 이 수만큼 더 부른다. */
const RETRY_WAITS = [1_500, 4_000];

async function callOnce(system: string, user: string, schema: unknown): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("no-key", "GEMINI_API_KEY가 설정되어 있지 않습니다.");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    const why = e instanceof Error && e.name === "TimeoutError" ? "시간이 초과되었습니다" : "연결하지 못했습니다";
    throw new GeminiError("network", `Google AI Studio에 ${why}.`);
  }

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;

  if (!res.ok) {
    const detail = data.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new GeminiError("auth", `API 키가 거부되었습니다. (${detail})`);
    }
    if (res.status === 429) {
      throw new GeminiError("quota", `사용량 한도에 걸렸습니다. (${detail})`);
    }
    throw new GeminiError("upstream", `Google AI Studio 오류. (${detail})`, res.status);
  }

  const candidate = data.candidates?.[0];
  const raw = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!raw.trim()) {
    const reason = candidate?.finishReason ?? "빈 응답";
    throw new GeminiError("bad-output", `결과를 받지 못했습니다. (${reason})`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new GeminiError("bad-output", "결과가 JSON 형식이 아닙니다.");
  }
}

/** 원문을 제목·내용 쌍으로 나눈다. 실패하면 GeminiError를 던진다. */
export async function splitAdText(text: string): Promise<AdPair[]> {
  const parsed = await generateJson(SYSTEM, text, SCHEMA);

  if (!Array.isArray(parsed)) throw new GeminiError("bad-output", "결과가 목록 형식이 아닙니다.");

  return parsed.map((item) => {
    const o = (item ?? {}) as Partial<AdPair> & { newTitle?: unknown };
    const title = typeof o.title === "string" ? o.title : "";
    const body = typeof o.body === "string" ? o.body : "";
    // 종류를 빠뜨렸거나 엉뚱한 값을 보냈으면 규칙으로 다시 가른다
    const kind = KINDS.includes(o.kind as ParsedKind) ? (o.kind as ParsedKind) : classify(title, body);
    // 원문에 제목이 있으면 지어 온 제목은 쓰지 않는다
    const newTitle = kind === "ad" && !title.trim() ? cleanNewTitle(o.newTitle) : "";
    return { kind, title, body, ...(newTitle ? { newTitle } : {}) };
  });
}
