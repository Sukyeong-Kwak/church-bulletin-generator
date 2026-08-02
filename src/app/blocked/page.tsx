"use client";

import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Btn, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * 관리자가 이용을 중지한 계정이 보는 화면.
 * 로그인은 되지만 주보·설정에는 손댈 수 없다 — 데이터는 정책이 막고, 이 화면이 이유를 알려준다.
 */
export default function BlockedPage() {
  const router = useRouter();

  const signOut = async () => {
    await supabaseBrowser()?.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <AuthShell
      title="이용이 중지된 계정입니다"
      desc="관리자가 이 계정의 이용을 중지했습니다. 다시 쓰려면 담당자에게 문의해주세요."
    >
      <Hint>계정과 만들어둔 주보는 지워지지 않았습니다. 중지가 풀리면 그대로 이어서 쓸 수 있습니다.</Hint>
      <Btn variant="primary" onClick={signOut} style={{ padding: "10px 12px" }}>
        로그아웃
      </Btn>
    </AuthShell>
  );
}
