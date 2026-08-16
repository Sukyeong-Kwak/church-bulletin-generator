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

  /**
   * 리다이렉트하면서 방금 갱신한 세션 쿠키를 함께 실어 보낸다.
   *
   * getUser가 토큰을 새로 받으면 리프레시 토큰이 한 번 쓰고 버려진다(회전).
   * 새 쿠키를 응답에 담지 않으면 브라우저에는 이미 죽은 토큰만 남아, 다음 요청에서
   * 로그인하지 않은 사람으로 보인다 — 방금 로그인했는데 다시 튕기는 꼴이 된다.
   */
  const redirectTo = (target: URL) => {
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return redirectTo(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirectTo(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 파일과 이미지 요청은 건너뛴다.
     *
     * manual/은 사용자 매뉴얼 PDF다. 여기서 빼지 않으면 로그인 안 한 사람이 받으려 할 때
     * 로그인 화면으로 튕긴다 — 가입 전에 읽어보라고 걸어둔 링크라 그러면 뜻이 없다.
     * 확장자로 열지 않고 폴더로 여는 이유는, 다른 자리의 PDF까지 덩달아 열리지 않게 하려는 것이다.
     */
    "/((?!_next/static|_next/image|favicon.ico|fonts/|logo/|manual/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
