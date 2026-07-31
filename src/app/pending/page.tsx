"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function PendingPage() {
  return (
    <Suspense>
      <Pending />
    </Suspense>
  );
}

/** 가입은 했지만 아직 승인되지 않은 사람에게 보이는 화면 */
function Pending() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(
    params.get("code") === "invalid" ? "초대코드가 유효하지 않거나 24시간이 지났습니다." : undefined,
  );
  const [busy, setBusy] = useState(false);

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);

    const supabase = supabaseBrowser();
    const { data: ok, error } = await supabase!.rpc("redeem_invite_code", {
      p_code: code.trim(),
    });

    if (error || !ok) {
      setError("초대코드가 유효하지 않거나 24시간이 지났습니다.");
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh();
  };

  const signOut = async () => {
    await supabaseBrowser()?.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <AuthShell
      title="승인을 기다리는 중입니다"
      desc="관리자가 승인하면 바로 주보를 만들 수 있습니다. 승인되면 이 화면을 새로고침해주세요."
    >
      <form onSubmit={redeem} className="flex flex-col gap-3">
        <Field label="초대코드가 있다면 지금 입력해도 됩니다">
          <input
            type="text"
            value={code}
            placeholder="단톡방에 공유된 코드"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>

        <AuthError message={error} />

        <Btn type="submit" variant="primary" disabled={busy || !code.trim()} style={{ padding: "10px 12px" }}>
          {busy ? "확인 중…" : "코드로 바로 시작하기"}
        </Btn>
      </form>

      <Hint>초대코드는 발급 후 24시간 동안만 쓸 수 있습니다.</Hint>

      <Btn variant="ghost" onClick={signOut}>
        로그아웃
      </Btn>
    </AuthShell>
  );
}
