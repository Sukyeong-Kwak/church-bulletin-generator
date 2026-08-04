import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentUser } from "@/lib/supabase/server";

/**
 * 관리자 매뉴얼 PDF를 내보낸다.
 *
 * public/에 두지 않는 이유는 하나다 — 거기 두면 주소만 알면 누구나 받는다.
 * 이 앱은 화면에서 버튼을 감추는 것으로 끝내지 않고 서버에서도 함께 막는데,
 * 매뉴얼만 예외로 두면 그 약속이 깨진다. 그래서 여기서 역할을 한 번 더 확인한다.
 *
 * 사용자 매뉴얼은 반대다. 가입 전에 읽어보라고 만든 문서라 public/manual/에 그냥 둔다.
 */

/** 코드에서 import하지 않으므로 배포에 따라가도록 next.config.ts에 함께 적어두었다 */
const FILE = path.join(process.cwd(), "src", "assets", "manual", "the-piece-manual-admin.pdf");

/** 받는 사람 컴퓨터에 저장될 이름 */
const DOWNLOAD_NAME = "THE_PIECE_주보_매뉴얼_관리자용.pdf";

export async function GET(): Promise<Response> {
  // 로컬 모드에는 로그인 자체가 없다. 관리자 화면도 그대로 열리므로 여기서만 막지 않는다.
  if (supabaseConfigured) {
    const user = await currentUser();

    if (!user) {
      return new Response("로그인이 필요합니다.", { status: 401 });
    }
    if (user.role !== "admin" || user.status !== "approved") {
      return new Response("관리자만 받을 수 있는 문서입니다.", { status: 403 });
    }
  }

  let pdf: Buffer;
  try {
    pdf = await readFile(FILE);
  } catch {
    return new Response("매뉴얼 파일을 찾지 못했습니다.", { status: 404 });
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // 한글 이름은 filename*로만 제대로 간다. 못 읽는 브라우저를 위해 영문 이름을 같이 준다.
      "Content-Disposition":
        `attachment; filename="the-piece-manual-admin.pdf"; ` +
        `filename*=UTF-8''${encodeURIComponent(DOWNLOAD_NAME)}`,
      // 공용 컴퓨터를 쓰는 자리다 — 캐시에 남겨두지 않는다
      "Cache-Control": "private, no-store",
    },
  });
}
