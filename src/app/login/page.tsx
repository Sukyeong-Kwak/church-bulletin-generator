"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { VerifyCode } from "@/components/auth/VerifyCode";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** 메일 인증이 아직인 계정 — 로그인 대신 인증번호부터 받는다 */
  const [unconfirmed, setUnconfirmed] = useState(false);

  if (!supabaseConfigured) return <NotConfigured />;

  /**
   * 들어온 뒤에 할 일.
   * 차단된 계정은 들어오자마자 되돌려 보낸다 — 데이터는 어차피 정책에 막혀 있지만,
   * 막힌 화면을 헤매게 두지 않는다.
   */
  const afterAuth = async (userId: string) => {
    const supabase = supabaseBrowser()!;
    const { data: me } = await supabase.from("users").select("status").eq("id", userId).single();

    if (me?.status === "blocked") {
      await supabase.auth.signOut();
      setUnconfirmed(false);
      setError("관리자가 이 계정의 이용을 중지했습니다. 담당자에게 문의해주세요.");
      setBusy(false);
      return;
    }

    router.replace(params.get("next") || "/");
    router.refresh();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);

    const supabase = supabaseBrowser()!;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // 메일 인증을 안 했으면 Supabase가 아예 들여보내지 않는다.
      // 새 인증번호를 보내고 그 자리에서 마치게 한다.
      if (error.message.toLowerCase().includes("not confirmed")) {
        // 방금 가입해서 번호를 이미 받았다면 여기서 막힐 수 있다. 그때는 받은 번호를 쓰면 된다.
        await supabase.auth.resend({ type: "signup", email });
        setUnconfirmed(true);
      } else {
        setError(
          error.message.includes("Invalid login")
            ? "이메일 또는 비밀번호가 맞지 않습니다."
            : error.message,
        );
      }
      setBusy(false);
      return;
    }

    await afterAuth(data.user.id);
  };

  /** 인증번호가 맞으면 그대로 로그인 상태가 된다 */
  const verified = async () => {
    const {
      data: { user },
    } = await supabaseBrowser()!.auth.getUser();
    if (user) await afterAuth(user.id);
  };

  if (unconfirmed) {
    return (
      <AuthShell
        title="메일 주소 확인이 남았습니다"
        desc="가입은 되어 있지만 메일 주소를 아직 확인하지 않았습니다. 인증번호를 보냈으니 넣어주세요."
      >
        <VerifyCode
          email={email}
          onVerified={verified}
          onBack={() => setUnconfirmed(false)}
          backLabel="로그인 화면으로"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="로그인"
      footer={
        <span style={{ color: "var(--ui-muted)" }}>
          아직 계정이 없나요?{" "}
          <Link href="/signup" style={{ color: "var(--ui-accent)", fontWeight: 700 }}>
            가입 신청
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="이메일">
          <input
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="비밀번호">
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <AuthError message={error} />

        <Btn type="submit" variant="primary" disabled={busy} style={{ padding: "10px 12px" }}>
          {busy ? "확인 중…" : "로그인"}
        </Btn>

        <div className="text-center">
          <Link href="/reset-password" className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
            비밀번호를 잊으셨나요?
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

export function NotConfigured() {
  return (
    <AuthShell
      title="아직 서버가 연결되지 않았습니다"
      desc="지금은 로그인 없이 이 브라우저에만 저장되는 상태로 쓸 수 있습니다."
    >
      <Hint>
        서버 연결(로그인·승인·공용 저장)을 켜려면 Supabase 주소와 키를 환경변수로 넣어야 합니다.
        자세한 방법은 저장소의 <b>README</b>를 참고하세요.
      </Hint>
      <Link href="/">
        <Btn variant="primary" style={{ width: "100%", padding: "10px 12px" }}>
          주보 만들기로 돌아가기
        </Btn>
      </Link>
    </AuthShell>
  );
}
