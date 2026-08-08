"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { redeemFailMessage } from "@/components/auth/messages";
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
  /**
   * 이 계정이 지금 어떤 상태인가.
   * '기다리는 중'과 '거절됨'은 같은 화면에 서 있지만 전혀 다른 이야기다 —
   * 거절된 사람에게 기다리라고 하면 오지 않을 답을 기다리게 된다.
   */
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    let alive = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!alive || !user) return;

      const { data: mine } = await supabase
        .from("users")
        .select("status")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive) return;
      if (mine?.status) setStatus(mine.status);

      // 010 이전에 가입하며 적어둔 초대코드가 남아 있으면 지금 쓴다.
      // 그때는 메일 인증 전이라 로그인 상태가 아니어서 쓸 수 없었다.
      const saved = user.user_metadata?.invite_code as string | undefined;
      if (!saved || mine?.status !== "pending") return;

      const { data: ok } = await supabase.rpc("redeem_invite_code", { p_code: saved });
      // 한 번 쓴(또는 만료된) 코드는 지워 다시 시도하지 않게 한다
      await supabase.auth.updateUser({ data: { invite_code: null } });

      if (!alive) return;
      if (ok) {
        router.replace("/");
        router.refresh();
      } else {
        setError("가입할 때 적은 초대코드가 유효하지 않거나 24시간이 지났습니다.");
      }
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  /**
   * 거절된 계정.
   * 기다린다고 열리지 않으므로 '기다리는 중'이라고 말하지 않는다.
   * 코드로도 열리지 않으므로 코드 칸을 내주지 않는다 — 내주면 될 때까지 넣어보게 된다.
   * 되돌리는 것은 관리자만 한다.
   *
   * 거절한 까닭은 여기에 적지 않는다. 그것은 관리자끼리 남기는 기록이다.
   */
  const rejected = status === "rejected";

  const redeem = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);

    const supabase = supabaseBrowser()!;
    const { data: ok, error } = await supabase.rpc("redeem_invite_code", {
      p_code: code.trim(),
    });

    if (error || !ok) {
      // 코드가 죽은 것과 이 계정이 코드로 살아날 수 없는 것은 다르다.
      // 거절·차단된 사람에게 '코드가 틀렸다'고만 하면 멀쩡한 코드를 몇 번이고 다시 넣게 된다.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: mine } = user
        ? await supabase.from("users").select("status").eq("id", user.id).maybeSingle()
        : { data: null };

      setError(redeemFailMessage(mine?.status));
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
      title={rejected ? "가입이 거절되었습니다" : "승인을 기다리는 중입니다"}
      desc={
        rejected
          ? "관리자가 이 계정의 가입 신청을 받지 않았습니다. 사정을 알고 싶으시면 담당자에게 문의해주세요."
          : "메일 주소 확인은 끝났습니다. 이제 관리자가 승인하면 바로 주보를 만들 수 있습니다. 승인되면 이 화면을 새로고침해주세요."
      }
    >
      {/* 거절된 계정에는 코드가 통하지 않는다. 칸을 내주면 될 때까지 넣어보게 된다. */}
      {!rejected && (
        <>
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

            <Btn
              type="submit"
              variant="primary"
              disabled={busy || !code.trim()}
              style={{ padding: "10px 12px" }}
            >
              {busy ? "확인 중…" : "코드로 바로 시작하기"}
            </Btn>
          </form>

          <Hint>초대코드는 발급 후 24시간 동안만 쓸 수 있습니다.</Hint>
        </>
      )}

      {/* 승인을 기다리는 동안에도 자기 계정은 손볼 수 있어야 한다 (여기는 상단 메뉴가 없다) */}
      <Link href="/account" className="text-center text-[12px]" style={{ color: "var(--ui-muted)" }}>
        비밀번호 바꾸기
      </Link>

      <Btn variant="ghost" onClick={signOut}>
        로그아웃
      </Btn>
    </AuthShell>
  );
}
