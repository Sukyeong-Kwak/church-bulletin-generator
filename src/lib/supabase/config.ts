/**
 * Supabase 설정.
 *
 * 환경변수가 없으면 로그인 없이 브라우저에만 저장하는 "로컬 모드"로 동작한다.
 * 배포해둔 앱이 설정 전에도 멈추지 않게 하려는 것이다.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** 서버 연동이 켜져 있는지 */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** 로그인 없이 열 수 있는 경로 */
export const PUBLIC_PATHS = ["/login", "/signup", "/reset-password", "/share"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
