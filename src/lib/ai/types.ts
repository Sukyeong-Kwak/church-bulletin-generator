/** 서버·브라우저가 함께 쓰는 값. 여기에는 키를 만지는 코드가 없다. */

import type { ParsedBlock } from "@/lib/parseAds";

/** 붙여넣기 한 번에 보낼 수 있는 글자 수 상한 */
export const MAX_INPUT = 20_000;

export interface AdPair {
  title: string;
  body: string;
}

export type ParseFailure =
  | "no-key"
  | "auth"
  | "quota"
  | "upstream"
  | "network"
  | "bad-output"
  | "bad-request";

/** /api/parse-ads 성공 응답 */
export interface ParseResponse {
  /** ai = AI가 나눈 결과, rule = 규칙 파서로 되돌아간 결과 */
  source: "ai" | "rule";
  blocks: ParsedBlock[];
  /** 되돌아갔거나 확인이 필요할 때의 안내 문구 */
  note?: string;
}

/** /api/parse-ads 실패 응답 */
export interface ParseErrorResponse {
  error: ParseFailure;
  message: string;
}
