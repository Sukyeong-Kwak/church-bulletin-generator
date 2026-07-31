"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";
import { NotConfigured } from "../login/page";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!supabaseConfigured) return <NotConfigured />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 정해주세요.");
      return;
    }

    setBusy(true);
    setError(undefined);
    const supabase = supabaseBrowser()!;

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
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
        <Field label="이름">
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

        <Hint>초대코드는 발급 후 24시간 동안만 쓸 수 있습니다.</Hint>
        <AuthError message={error} />

        <Btn type="submit" variant="primary" disabled={busy} style={{ padding: "10px 12px" }}>
          {busy ? "신청 중…" : "가입 신청"}
        </Btn>
      </form>
    </AuthShell>
  );
}
