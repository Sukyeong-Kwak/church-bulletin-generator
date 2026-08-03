"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, AuthShell } from "@/components/auth/AuthShell";
import { VerifyCode } from "@/components/auth/VerifyCode";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";
import { NotConfigured } from "../login/page";

/**
 * 가입에는 세 가지가 모두 있어야 한다.
 *   1. 이름과 비밀번호
 *   2. 살아 있는 초대코드
 *   3. 메일로 받은 인증번호
 *
 * 순서가 중요하다. 코드부터 확인하고 나서 계정을 만든다 —
 * 반대로 하면 코드가 틀렸을 때 쓸 수 없는 계정만 남는다.
 */
export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  /** 인증번호를 보냈고 입력을 기다리는 중 */
  const [sent, setSent] = useState(false);
  /**
   * 초대코드가 있어야 하는가.
   * 아무도 없는 새 DB의 첫 사람만 예외다 — 코드를 줄 관리자가 아직 없기 때문이다.
   */
  const [needCode, setNeedCode] = useState(true);

  // 로그인 전에도 답을 받을 수 있는 물음이라 화면을 그린 뒤에 물어본다
  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase.rpc("invite_required");
      if (!alive) return;
      // 004 마이그레이션 전이면 이 함수가 없다. 그때는 DB도 코드를 요구하지 않으므로 맞춰준다.
      setNeedCode(error ? false : data !== false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!supabaseConfigured) return <NotConfigured />;

  /** 메일 주소 확인이 끝난 뒤 — 이제 로그인 상태다. 코드를 실제로 쓴다. */
  const finish = async () => {
    const supabase = supabaseBrowser()!;
    const entered = code.trim();

    if (entered) {
      const { data: ok } = await supabase.rpc("redeem_invite_code", { p_code: entered });
      if (ok) {
        // 한 번 쓴 코드는 지운다 — 승인 대기 화면이 다시 시도하지 않게
        await supabase.auth.updateUser({ data: { invite_code: null } });
        router.replace("/");
        router.refresh();
        return;
      }
      // 가입하고 인증하는 사이에 코드가 만료됐다. 관리자 승인으로 돌린다.
      router.replace("/pending?code=invalid");
      router.refresh();
      return;
    }

    router.replace("/pending");
    router.refresh();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("비밀번호는 8자 이상으로 정해주세요.");
      return;
    }

    setBusy(true);
    setError(undefined);
    const supabase = supabaseBrowser()!;
    const entered = code.trim();

    // 계정을 만들기 전에 코드부터 본다. 여기서는 쓰지 않고 살아 있는지만 확인한다.
    if (needCode) {
      const { data: valid, error: checkError } = await supabase.rpc("check_invite_code", {
        p_code: entered,
      });
      if (checkError || !valid) {
        setError("초대코드가 유효하지 않거나 24시간이 지났습니다. 발급한 분께 다시 받아주세요.");
        setBusy(false);
        return;
      }
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim(), invite_code: entered || null } },
    });

    if (signUpError) {
      setError(
        signUpError.message.includes("already registered")
          ? "이미 가입된 이메일입니다. 로그인해주세요."
          : // 가입 조건은 DB에서도 막는다. 걸리면 이 뭉뚱그린 메시지로 돌아온다.
            signUpError.message.toLowerCase().includes("database error")
            ? "이름과 초대코드를 다시 확인해주세요."
            : signUpError.message,
      );
      setBusy(false);
      return;
    }

    // 이미 가입을 마친 주소로 다시 신청하면 Supabase는 빈 계정을 돌려준다.
    // (있는 주소인지 아닌지를 아무나 알아내지 못하게 하려는 것이다)
    if (data.user && data.user.identities?.length === 0) {
      setError("이미 가입된 이메일입니다. 로그인해주세요.");
      setBusy(false);
      return;
    }

    // 메일 확인이 꺼져 있으면 이 자리에서 바로 로그인된다
    if (data.session) {
      await finish();
      return;
    }

    setSent(true);
    setBusy(false);
  };

  if (sent) {
    return (
      <AuthShell
        title="인증번호를 보냈습니다"
        desc={`${email} 로 6자리 숫자를 보냈습니다. 번호를 넣어야 가입이 끝납니다.`}
        footer={
          <Link href="/login" style={{ color: "var(--ui-accent)", fontWeight: 700 }}>
            로그인 화면으로
          </Link>
        }
      >
        <VerifyCode email={email} onVerified={finish} onBack={() => setSent(false)} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="가입 신청"
      desc="초대코드와 메일 인증이 모두 있어야 가입됩니다. 코드는 관리자에게 받으세요."
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
        <Field label={needCode ? "초대코드" : "초대코드 (첫 관리자는 비워두세요)"}>
          <input
            type="text"
            value={code}
            required={needCode}
            placeholder="관리자에게 받은 코드"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>

        <Hint>
          신청하면 이 주소로 6자리 인증번호가 갑니다. 번호까지 넣어야 가입이 끝납니다. 초대코드는
          발급 후 24시간 동안만 쓸 수 있습니다.
        </Hint>
        <AuthError message={error} />

        <Btn type="submit" variant="primary" disabled={busy} style={{ padding: "10px 12px" }}>
          {busy ? "신청 중…" : "가입 신청"}
        </Btn>
      </form>
    </AuthShell>
  );
}
