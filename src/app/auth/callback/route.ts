import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * 이메일로 보낸 링크(가입 확인·비밀번호 재설정)가 돌아오는 자리.
 * 링크에 실려 온 것을 세션으로 바꾼 뒤 목적지로 보낸다.
 *
 * 메일 링크는 두 모양으로 온다. 어느 쪽이 오는지는 Supabase의 메일 서식에 달려 있어서
 * (기본 서식은 code, 직접 고친 서식은 token_hash) 둘 다 받는다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await supabaseServer();

  if (supabase) {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
