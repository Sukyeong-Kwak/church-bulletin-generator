/**
 * Supabase 설정.
 *
 * 환경변수가 없으면 로그인 없이 브라우저에만 저장하는 "로컬 모드"로 동작한다.
 * 배포해둔 앱이 설정 전에도 멈추지 않게 하려는 것이다.
 */
/**
 * 프로젝트 주소만 남긴다.
 *
 * Supabase 화면에는 Project URL 옆에 REST 주소(`.../rest/v1`)도 같이 적혀 있어서
 * 그쪽을 복사하기 쉽다. 그대로 두면 SDK가 뒤에 `/auth/v1`·`/rest/v1`을 한 번 더 붙여
 * `/rest/v1/auth/v1/signup` 같은 없는 주소로 요청이 가고, 가입이 404로 죽는다.
 * 오류 문구("Invalid path specified in request URL")만 보고는 원인을 알기 어려워 여기서 잘라낸다.
 */
function projectUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth|storage|realtime)\/v1$/, "")
    .replace(/\/+$/, "");
}

export const SUPABASE_URL = projectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
export const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

/** 서버 연동이 켜져 있는지 */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** 로그인 없이 열 수 있는 경로 */
export const PUBLIC_PATHS = ["/login", "/signup", "/reset-password", "/share"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
