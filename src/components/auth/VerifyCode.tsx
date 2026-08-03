"use client";

import { useEffect, useState } from "react";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AuthError, AuthNotice } from "./AuthShell";

/** 다시 보내기를 누를 수 있게 되기까지 (초) */
const RESEND_WAIT = 60;

/** 인증번호 자리수 — Supabase 기본값 */
const CODE_LENGTH = 6;

function readable(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired") || m.includes("invalid"))
    return "인증번호가 맞지 않거나 시간이 지났습니다. 아래 '다시 보내기'를 눌러 새 번호를 받아주세요.";
  if (m.includes("rate limit") || m.includes("for security purposes"))
    return "메일을 너무 자주 보냈습니다. 1분쯤 뒤에 다시 시도해주세요.";
  return message;
}

/**
 * 메일로 받은 인증번호를 입력받아 메일 주소를 확인한다.
 * 확인이 끝나면 그 자리에서 로그인 상태가 된다.
 *
 * 가입 화면과 로그인 화면이 같이 쓴다 — 인증을 안 끝낸 사람은 로그인으로도 들어오기 때문이다.
 */
export function VerifyCode({
  email,
  onVerified,
  onBack,
  backLabel = "이메일 고치기",
}: {
  email: string;
  /** 인증이 끝나 로그인 상태가 된 뒤에 할 일 */
  onVerified: () => void | Promise<void>;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(RESEND_WAIT);

  // 다시 보내기까지 남은 시간. 메일이 오는 데 1~2분 걸리는데
  // 그동안 계속 누르면 Supabase 쪽에서 아예 막아버린다.
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    const { error } = await supabaseBrowser()!.auth.verifyOtp({
      email,
      token: code,
      type: "signup",
    });

    if (error) {
      setError(readable(error.message));
      setBusy(false);
      return;
    }

    await onVerified();
    setBusy(false);
  };

  const resend = async () => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    const { error } = await supabaseBrowser()!.auth.resend({ type: "signup", email });

    if (error) setError(readable(error.message));
    else {
      setNotice("인증번호를 다시 보냈습니다.");
      setLeft(RESEND_WAIT);
      setCode("");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <Field label={`${email} 로 보낸 인증번호 ${CODE_LENGTH}자리`}>
        <input
          type="text"
          value={code}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          placeholder="000000"
          maxLength={CODE_LENGTH}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          style={{ fontSize: 20, fontWeight: 700, letterSpacing: 8, textAlign: "center" }}
        />
      </Field>

      <AuthError message={error} />
      <AuthNotice message={notice} />

      <Btn
        type="submit"
        variant="primary"
        disabled={busy || code.length < CODE_LENGTH}
        style={{ padding: "10px 12px" }}
      >
        {busy ? "확인 중…" : "인증번호 확인"}
      </Btn>

      {/* 폼 안이므로 type을 적어야 한다 — 안 적으면 눌렀을 때 인증번호 확인이 함께 돌아간다 */}
      <Btn type="button" onClick={resend} disabled={busy || left > 0}>
        {left > 0 ? `다시 보내기 (${left}초)` : "인증번호 다시 보내기"}
      </Btn>

      {onBack && (
        <Btn type="button" variant="ghost" onClick={onBack} disabled={busy}>
          {backLabel}
        </Btn>
      )}

      <Hint>메일이 안 보이면 스팸함도 확인해보세요. 도착까지 1~2분 걸릴 수 있습니다.</Hint>
    </form>
  );
}
