import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";
import type { AppUser, Database } from "./types";

/** 서버 컴포넌트·서버 액션용 클라이언트. 설정이 없으면 null(로컬 모드). */
export async function supabaseServer() {
  if (!supabaseConfigured) return null;
  const store = await cookies();

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 미들웨어가 맡는다.
        }
      },
    },
  });
}

/**
 * 지금 로그인한 사람의 상태.
 *
 * '로그인하지 않았다'와 '로그인했지만 가입 행이 없다'는 다른 일이라 따로 돌려준다.
 * 둘을 뭉뚱그려 null 하나로 보내면, 가입 행이 없는 사람을 로그인 화면으로 보내게 되고
 * proxy.ts가 그를 다시 안으로 되돌려 화면이 끝없이 튕긴다.
 */
export async function currentSession(): Promise<{ authed: boolean; profile: AppUser | null }> {
  const supabase = await supabaseServer();
  if (!supabase) return { authed: false, profile: null };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { authed: false, profile: null };

  // 행이 없을 수 있다(트리거가 못 만든 계정). single()은 그걸 오류로 치므로 maybeSingle을 쓴다.
  const { data, error } = await supabase.from("users").select("*").eq("id", user.id).maybeSingle();

  /*
   * 못 읽은 것과 없는 것은 다르다.
   * 여기서 오류를 삼키면 권한(GRANT)이나 정책 문제가 '가입 안 한 사람'으로 둔갑해,
   * 로그인은 되는데 화면만 계속 튕기는 알 수 없는 증상으로 나타난다. 반드시 남긴다.
   */
  if (error) console.error("[auth] users 행을 읽지 못했습니다:", error.code, error.message);

  return { authed: true, profile: data ?? null };
}

/** 지금 로그인한 사용자의 승인 상태까지 함께 가져온다 */
export async function currentUser(): Promise<AppUser | null> {
  return (await currentSession()).profile;
}
