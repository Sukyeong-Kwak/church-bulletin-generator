import { NextResponse } from "next/server";
import { anchorBlocks } from "@/lib/ai/anchor";
import { GeminiError, splitAdText } from "@/lib/ai/gemini";
import { tidyBlocks } from "@/lib/ai/tidy";
import { MAX_INPUT, type ParseErrorResponse, type ParseResponse } from "@/lib/ai/types";
import { normalize, parseAdText } from "@/lib/parseAds";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";

/**
 * 붙여넣은 광고 원문을 제목·내용으로 나눠 돌려준다.
 *
 * API 키는 이 파일이 도는 서버에만 있고 브라우저로 나가지 않는다.
 * AI 결과가 원문과 어긋나면 규칙 파서 결과로 되돌려 보낸다 —
 * 화면에 원문에 없던 글자가 뜨는 일은 없다.
 *
 * 나눈 뒤, 한 덩어리로 뭉쳐 온 긴 줄글만 골라 읽기 좋게 다듬은 글을 함께 보낸다.
 * 다듬은 글은 원문을 덮지 않고 `tidy`에 따로 담기며, 화면에서 사람이 승인해야 쓰인다.
 *
 * 호출할 때마다 돈이 나가므로, 서버 연동이 켜져 있으면 승인된 사람만 부를 수 있다.
 * 로컬 모드(환경변수 없음)에서는 로그인 자체가 없어 그대로 열어둔다.
 */
export async function POST(request: Request): Promise<NextResponse<ParseResponse | ParseErrorResponse>> {
  if (supabaseConfigured) {
    const user = await currentUser();
    if (user?.status !== "approved") {
      return NextResponse.json<ParseErrorResponse>(
        { error: "unauthorized", message: "로그인하고 승인을 받아야 쓸 수 있습니다." },
        { status: 401 },
      );
    }
  }

  let text: unknown;
  try {
    ({ text } = (await request.json()) as { text?: unknown });
  } catch {
    return bad("보낸 내용을 읽지 못했습니다.");
  }

  if (typeof text !== "string" || !text.trim()) return bad("나눌 내용이 비어 있습니다.");
  if (text.length > MAX_INPUT) {
    return bad(`한 번에 ${MAX_INPUT.toLocaleString()}자까지 나눌 수 있습니다. 나눠서 붙여넣어 주세요.`);
  }

  const source = normalize(text);

  let pairs;
  try {
    pairs = await splitAdText(source);
  } catch (e) {
    if (e instanceof GeminiError) {
      return NextResponse.json<ParseErrorResponse>(
        { error: e.code, message: e.message },
        { status: e.code === "no-key" ? 503 : e.code === "quota" ? 429 : 502 },
      );
    }
    throw e;
  }

  const { blocks, ok, reason } = anchorBlocks(source, pairs);

  if (!ok) {
    return NextResponse.json<ParseResponse>({
      source: "rule",
      blocks: parseAdText(source),
      note: `${reason ?? "AI 결과가 원문과 어긋났습니다."} 규칙 방식으로 나눈 결과를 보여드립니다.`,
    });
  }

  // 나누기가 원문과 꼭 맞았을 때에만 다듬기로 넘어간다.
  // 다듬은 글은 tidy에 따로 담기므로 원문은 여기서도 그대로 남는다.
  const tidied = await tidyBlocks(blocks);

  return NextResponse.json<ParseResponse>({
    source: "ai",
    blocks: tidied.blocks,
    note: tidied.dropped
      ? `${tidied.dropped}칸은 AI가 다듬은 글에서 내용이 달라져 원문 그대로 두었습니다.`
      : undefined,
  });
}

function bad(message: string) {
  return NextResponse.json<ParseErrorResponse>({ error: "bad-request", message }, { status: 400 });
}
