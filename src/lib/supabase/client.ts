"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";
import type { Database } from "./types";

export type Client = SupabaseClient<Database>;

let cached: Client | null = null;

/**
 * 브라우저용 Supabase 클라이언트. 설정이 없으면 null(로컬 모드).
 *
 * 한 번 로그인하면 계속 로그인된 채로 둔다.
 *   persistSession    로그인 정보를 쿠키에 남긴다. 창을 닫거나 컴퓨터를 껐다 켜도 이어진다.
 *                     (쿠키라서 서버 화면도 같은 세션을 본다 — localStorage였다면 서버는 못 본다)
 *   autoRefreshToken  토큰은 한 시간짜리다. 만료되기 전에 리프레시 토큰으로 알아서 새로 받는다.
 *   detectSessionInUrl 메일 링크에 실려 온 것을 세션으로 바꾼다.
 *
 * 기본값과 같지만 적어 둔다 — 로그인이 자꾸 풀린다는 말이 나올 때 여기부터 보게 된다.
 * 화면을 열지 않고 오래 두었다가 들어와도, 미들웨어(proxy.ts)가 요청마다 세션을 갱신한다.
 */
export function supabaseBrowser(): Client | null {
  if (!supabaseConfigured) return null;
  cached ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}
