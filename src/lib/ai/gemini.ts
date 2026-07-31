/**
 * Google AI Studio(Gemini) 호출부 — 서버에서만 쓴다.
 *
 * 하는 일은 하나. 붙여넣은 광고 원문을 "제목 / 내용" 쌍으로 나누는 것.
 * 글자를 고치는 일은 절대 시키지 않으며, 실제로 고쳐 왔는지는
 * anchor.ts 가 원문과 대조해 걸러낸다. (모델 말을 믿지 않는다)
 */

import type { AdPair, ParseFailure } from "./types";

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
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

const SYSTEM = `너는 교회 주보의 광고 원문을 "제목"과 "내용"으로 나누기만 하는 도구다.

규칙
1. 원문의 글자를 절대 고치지 마라. 맞춤법·띄어쓰기·문장부호·숫자·줄바꿈을 원문 그대로 옮긴다. 요약·의역·번역·윤문·추가·삭제 모두 금지다.
2. 원문에 나온 순서 그대로 출력한다. 순서를 바꾸거나 비슷한 광고를 합치지 마라.
3. 광고 한 덩어리에서 제목에 해당하는 줄은 title에, 나머지 줄은 body에 넣는다. 제목을 감싼 <>, [], 【】, () 같은 괄호와 ▶ · 1. 같은 글머리 기호도 원문에 있으면 그대로 둔다.
4. 제목이라고 볼 줄이 없으면 title은 빈 문자열로 두고 전부 body에 넣는다.
5. 원문의 모든 글자는 title이나 body 중 정확히 한 곳에 들어가야 한다. 어디에도 넣지 않고 버리는 글자가 있으면 안 된다.
6. 판단이 애매하면 나누지 말고 한 덩어리로 둬라. 지어내는 것보다 덜 나누는 편이 낫다.
7. 설명·인사말·머리말 없이 JSON만 출력한다.`;

const SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      body: { type: "STRING" },
    },
    required: ["title", "body"],
    propertyOrdering: ["title", "body"],
  },
} as const;

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  error?: { message?: string };
}

/** 원문을 제목·내용 쌍으로 나눈다. 실패하면 GeminiError를 던진다. */
export async function splitAdText(text: string): Promise<AdPair[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("no-key", "GEMINI_API_KEY가 설정되어 있지 않습니다.");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
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
    throw new GeminiError("upstream", `Google AI Studio 오류. (${detail})`);
  }

  const candidate = data.candidates?.[0];
  const raw = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!raw.trim()) {
    const reason = candidate?.finishReason ?? "빈 응답";
    throw new GeminiError("bad-output", `결과를 받지 못했습니다. (${reason})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GeminiError("bad-output", "결과가 JSON 형식이 아닙니다.");
  }

  if (!Array.isArray(parsed)) throw new GeminiError("bad-output", "결과가 목록 형식이 아닙니다.");

  return parsed.map((item) => {
    const o = (item ?? {}) as Partial<AdPair>;
    return {
      title: typeof o.title === "string" ? o.title : "",
      body: typeof o.body === "string" ? o.body : "",
    };
  });
}
