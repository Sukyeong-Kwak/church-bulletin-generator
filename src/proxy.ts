import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isPublicPath,
  supabaseConfigured,
} from "@/lib/supabase/config";

/**
 * 세션 쿠키를 갱신하고 로그인하지 않은 접근을 막는다.
 * Supabase 설정이 없으면 아무것도 하지 않고 통과시킨다(로컬 모드).
 *
 * 실제 권한 확인은 각 화면의 서버 레이아웃(requireApproved)에서 한 번 더 한다.
 * 여기서는 로그인 여부만 훑고 넘긴다.
 */
export async function proxy(request: NextRequest) {
  if (!supabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser를 호출해야 만료된 세션이 갱신된다
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일과 이미지 요청은 건너뛴다
    "/((?!_next/static|_next/image|favicon.ico|fonts/|logo/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
