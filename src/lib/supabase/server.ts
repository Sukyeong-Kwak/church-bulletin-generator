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

/** 지금 로그인한 사용자의 승인 상태까지 함께 가져온다 */
export async function currentUser(): Promise<AppUser | null> {
  const supabase = await supabaseServer();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("users").select("*").eq("id", user.id).single();
  return data ?? null;
}
