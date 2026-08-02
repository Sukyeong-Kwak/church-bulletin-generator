"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";
import { NotConfigured } from "../login/page";

/**
 * 확인 메일을 보낸 뒤 보여주는 화면.
 * 여기서 링크를 누르기 전까지는 로그인할 수 없다 — 남의 메일 주소로 가입하는 것을 막는다.
 */
function CheckMailbox({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true);
    setError(undefined);
    const { error } = await supabaseBrowser()!.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/pending` },
    });
    if (error) setError(error.message);
    else setSent(true);
    setBusy(false);
  };

  return (
    <AuthShell
      title="메일함을 확인해주세요"
      desc={`${email} 로 확인 메일을 보냈습니다. 링크를 누르면 가입이 끝나고, 그다음 관리자 승인을 기다립니다.`}
      footer={
        <Link href="/login" style={{ color: "var(--ui-accent)", fontWeight: 700 }}>
          로그인 화면으로
        </Link>
      }
    >
      <Hint>메일이 안 보이면 스팸함도 확인해보세요. 도착까지 1~2분 걸릴 수 있습니다.</Hint>
      <AuthError message={error} />
      <Btn onClick={resend} disabled={busy || sent} style={{ padding: "10px 12px" }}>
        {sent ? "다시 보냈습니다" : busy ? "보내는 중…" : "확인 메일 다시 보내기"}
      </Btn>
    </AuthShell>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** 확인 메일을 보냈고 링크를 누르기를 기다리는 중 */
  const [sent, setSent] = useState(false);

  if (!supabaseConfigured) return <NotConfigured />;
  if (sent) return <CheckMailbox email={email} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 정해주세요.");
      return;
    }

    setBusy(true);
    setError(undefined);
    const supabase = supabaseBrowser()!;

    // 초대코드는 계정에 실어 보낸다. 메일 인증을 켜두면 지금은 로그인 상태가 아니라
    // 코드를 쓸 수 없어서, 링크를 눌러 들어온 뒤 승인 대기 화면에서 자동으로 쓰인다.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, invite_code: code.trim() || null },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/pending`,
      },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "이미 가입된 이메일입니다. 로그인해주세요."
          : signUpError.message,
      );
      setBusy(false);
      return;
    }

    // 메일 인증이 켜져 있으면 아직 로그인 전이다 — 메일함 안내로 넘어간다
    if (!data.session) {
      setSent(true);
      setBusy(false);
      return;
    }

    // 초대코드가 있으면 바로 승인된다. 없으면 관리자 승인을 기다린다.
    if (code.trim()) {
      const { data: ok } = await supabase.rpc("redeem_invite_code", { p_code: code.trim() });
      if (!ok) {
        router.replace("/pending?code=invalid");
        return;
      }
    }

    router.replace(code.trim() ? "/" : "/pending");
    router.refresh();
  };

  return (
    <AuthShell
      title="가입 신청"
      desc="가입 후 관리자 승인을 받아야 주보를 만들 수 있습니다. 초대코드가 있으면 바로 시작합니다."
      footer={
        <span style={{ color: "var(--ui-muted)" }}>
          이미 계정이 있나요?{" "}
          <Link href="/login" style={{ color: "var(--ui-accent)", fontWeight: 700 }}>
            로그인
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="이름 (주보에 남는 이름이 아니라, 관리자가 누구인지 알아보는 용도입니다)">
          <input
            type="text"
            value={name}
            required
            placeholder="홍길동"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="이메일">
          <input
            type="email"
            value={email}
            autoComplete="email"
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="비밀번호 (8자 이상)">
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            required
            minLength={8}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="초대코드 (없으면 비워두세요)">
          <input
            type="text"
            value={code}
            placeholder="단톡방에 공유된 코드"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>

        <Hint>
          신청하면 이 주소로 확인 메일이 갑니다. 링크를 눌러 메일 주소를 확인한 뒤 관리자 승인을
          받으면 시작할 수 있습니다. 초대코드는 발급 후 24시간 동안만 쓸 수 있습니다.
        </Hint>
        <AuthError message={error} />

        <Btn type="submit" variant="primary" disabled={busy} style={{ padding: "10px 12px" }}>
          {busy ? "신청 중…" : "가입 신청"}
        </Btn>
      </form>
    </AuthShell>
  );
}
