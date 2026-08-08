"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthError, AuthNotice, AuthShell } from "@/components/auth/AuthShell";
import { authMessage } from "@/components/auth/messages";
import { Btn, Field } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";
import { NotConfigured } from "../login/page";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPassword />
    </Suspense>
  );
}

function ResetPassword() {
  const params = useSearchParams();
  // 메일 링크를 타고 들어오면 새 비밀번호를 정하는 화면
  const updating = params.get("mode") === "update";

  if (!supabaseConfigured) return <NotConfigured />;
  return updating ? <UpdateForm /> : <RequestForm />;
}

function RequestForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);

    const supabase = supabaseBrowser()!;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password%3Fmode%3Dupdate`,
    });

    if (error) setError(authMessage(error.message));
    else setSent(true);
    setBusy(false);
  };

  return (
    <AuthShell
      title="비밀번호 재설정"
      desc="가입한 이메일로 재설정 링크를 보내드립니다."
      footer={
        <Link href="/login" style={{ color: "var(--ui-muted)" }}>
          로그인으로 돌아가기
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="이메일">
          <input
            type="email"
            value={email}
            required
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <AuthError message={error} />
        <AuthNotice message={sent ? "메일을 보냈습니다. 받은편지함을 확인해주세요." : undefined} />

        <Btn type="submit" variant="primary" disabled={busy} style={{ padding: "10px 12px" }}>
          {busy ? "보내는 중…" : "재설정 링크 보내기"}
        </Btn>
      </form>
    </AuthShell>
  );
}

function UpdateForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** 재설정 링크가 실어다 준 세션이 실제로 있는가 (한 번 쓴 링크·만료된 링크면 없다) */
  const [ready, setReady] = useState<boolean>();

  // 링크 없이 이 주소로 바로 들어오는 길이 열려 있다.
  // 그대로 두면 다 적고 누른 뒤에야 영어로 "Auth session missing!"이 뜬다 — 먼저 확인한다.
  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    let alive = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setReady(!!data.user);
    });

    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 정해주세요.");
      return;
    }
    if (password !== password2) {
      setError("비밀번호가 서로 다릅니다. 두 칸을 같게 넣어주세요.");
      return;
    }

    setBusy(true);
    setError(undefined);

    const supabase = supabaseBrowser()!;
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(authMessage(error.message));
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh();
  };

  if (ready === false) {
    return (
      <AuthShell
        title="링크가 만료되었습니다"
        desc="재설정 링크는 한 번만, 그리고 정해진 시간 안에만 쓸 수 있습니다. 다시 받아주세요."
        footer={
          <Link href="/login" style={{ color: "var(--ui-muted)" }}>
            로그인으로 돌아가기
          </Link>
        }
      >
        <Link href="/reset-password">
          <Btn variant="primary" style={{ width: "100%", padding: "10px 12px" }}>
            재설정 링크 다시 받기
          </Btn>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="새 비밀번호 정하기">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="새 비밀번호 (8자 이상)">
          <input
            type="password"
            value={password}
            required
            minLength={8}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="새 비밀번호 다시 넣기">
          <input
            type="password"
            value={password2}
            required
            minLength={8}
            autoComplete="new-password"
            onChange={(e) => setPassword2(e.target.value)}
          />
        </Field>

        <AuthError message={error} />

        <Btn
          type="submit"
          variant="primary"
          disabled={busy || ready === undefined}
          style={{ padding: "10px 12px" }}
        >
          {busy ? "바꾸는 중…" : "비밀번호 바꾸기"}
        </Btn>
      </form>
    </AuthShell>
  );
}
