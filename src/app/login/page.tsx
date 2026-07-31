"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
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

  if (!supabaseConfigured) return <NotConfigured />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);

    const supabase = supabaseBrowser();
    const { error } = await supabase!.auth.signInWithPassword({ email, password });

    if (error) {
      setError(
        error.message.includes("Invalid login")
          ? "이메일 또는 비밀번호가 맞지 않습니다."
          : error.message,
      );
      setBusy(false);
      return;
    }

    router.replace(params.get("next") || "/");
    router.refresh();
  };

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
