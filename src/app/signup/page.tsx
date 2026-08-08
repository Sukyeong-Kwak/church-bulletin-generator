"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthError, AuthNotice, AuthShell } from "@/components/auth/AuthShell";
import { authMessage } from "@/components/auth/messages";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";
import { NotConfigured } from "../login/page";

const MIN_PASSWORD = 8;

/** 인증번호 자리수 — Supabase 기본값 */
const CODE_LENGTH = 6;

/** 다시 보내기를 누를 수 있게 되기까지 (초) */
const RESEND_WAIT = 60;

/**
 * 가입은 세 걸음이다.
 *   1. 적는다      — 이름·이메일·비밀번호·초대코드
 *   2. 인증한다    — 메일로 온 6자리 번호를 넣어 이 주소가 제 것임을 보인다
 *   3. 신청한다    — 인증을 마쳐야 이 버튼이 열린다
 *
 * 걸음을 나눈 까닭:
 * 한 번에 다 하면 무엇 때문에 막혔는지가 뭉뚱그려진다. 메일이 안 왔는지, 번호가 틀렸는지,
 * 코드가 지났는지를 각자의 자리에서 알려주려면 누르는 자리도 나뉘어 있어야 한다.
 *
 * 다만 Supabase는 '계정을 만들면서' 인증번호를 보낸다 — 주소만 먼저 확인하는 길이 없다.
 * 그래서 계정 행은 1번이 아니라 2번을 누르는 순간에 생긴다. 인증을 마치지 못한 행은
 * 승인되지 않으므로 아무것도 하지 못하고, 같은 주소로 다시 신청하면 이어서 쓴다.
 */
type Step = "idle" | "sent" | "verified";

/** 인증번호를 받을 때 실제로 계정에 새겨진 값 — 그 뒤에 칸을 고쳤는지 견주려고 들고 있는다 */
interface SentWith {
  email: string;
  name: string;
  password: string;
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** 비밀번호는 눈에 보이지 않아 오타를 알아챌 수 없다. 두 번 받아 맞춰본다. */
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [otp, setOtp] = useState("");

  const [step, setStep] = useState<Step>("idle");
  const [sentWith, setSentWith] = useState<SentWith>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);

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

  // 다시 보내기까지 남은 시간. 메일이 오는 데 1~2분 걸리는데
  // 그동안 계속 누르면 Supabase 쪽에서 아예 막아버린다.
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  if (!supabaseConfigured) return <NotConfigured />;

  /** 적는 칸이 다 찼는가 — 인증번호를 보내려면 계정을 만들 수 있어야 하고, 그러려면 다 있어야 한다 */
  const filled =
    name.trim() !== "" &&
    email.trim() !== "" &&
    password.length >= MIN_PASSWORD &&
    password === password2 &&
    (!needCode || code.trim() !== "");

  /**
   * 이메일을 고치면 인증은 없던 일이 된다.
   * 번호는 주소 하나에 매여 있어서, 주소가 바뀌면 받아둔 번호도 그 주소의 것이 아니다.
   */
  const changeEmail = (value: string) => {
    setEmail(value);
    if (step !== "idle") {
      setStep("idle");
      setOtp("");
      setNotice(undefined);
      setError(undefined);
    }
  };

  // ---------------------------------------------------------------- 2. 인증번호 받기

  const sendCode = async () => {
    setError(undefined);
    setNotice(undefined);

    if (password.length < MIN_PASSWORD) {
      setError(`비밀번호는 ${MIN_PASSWORD}자 이상으로 정해주세요.`);
      return;
    }
    if (password !== password2) {
      setError("비밀번호가 서로 다릅니다. 두 칸을 같게 넣어주세요.");
      return;
    }

    setBusy(true);
    const supabase = supabaseBrowser()!;
    const entered = code.trim();

    // 계정을 만들기 전에 코드부터 본다. 여기서는 쓰지 않고 살아 있는지만 확인한다.
    if (needCode) {
      const { data: valid, error: checkError } = await supabase.rpc("check_invite_code", {
        p_code: entered,
      });
      // 못 물어본 것과 '아니다'라는 답은 다르다.
      // 한데 묶으면 잠깐 끊긴 인터넷 때문에 멀쩡한 코드를 버리고 다시 받으러 가게 된다.
      if (checkError) {
        setError(`초대코드를 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요. (${checkError.message})`);
        setBusy(false);
        return;
      }
      if (!valid) {
        setError("초대코드가 유효하지 않거나 24시간이 지났습니다. 발급한 분께 다시 받아주세요.");
        setBusy(false);
        return;
      }
    }

    // 같은 주소로 이미 보낸 적이 있으면 계정을 또 만들지 않고 번호만 다시 보낸다
    if (sentWith?.email === email) {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) {
        setError(authMessage(error.message));
        setBusy(false);
        return;
      }
      setNotice("인증번호를 다시 보냈습니다.");
      setLeft(RESEND_WAIT);
      setBusy(false);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim(), invite_code: entered || null } },
    });

    if (signUpError) {
      // 가입 조건은 DB에서도 막는다. 트리거가 올린 말은 이미 우리말이라 그대로 지나간다.
      setError(authMessage(signUpError.message));
      setBusy(false);
      return;
    }

    setSentWith({ email, name: name.trim(), password });

    // 이미 신청된 적이 있는 주소면 Supabase는 빈 계정을 돌려준다.
    // 아직 인증 전인 사람에게는 이때 번호를 다시 보내주므로, 여기서 길을 끊지 않는다.
    if (data.user && data.user.identities?.length === 0) {
      setNotice(
        "이미 신청된 적이 있는 주소입니다. 아직 인증 전이라면 방금 다시 보낸 번호를 넣어주세요.",
      );
    } else {
      setNotice(`${email} 로 ${CODE_LENGTH}자리 인증번호를 보냈습니다. 1~2분 걸릴 수 있습니다.`);
    }

    // 메일 확인이 꺼져 있으면 이 자리에서 바로 로그인된다 — 인증할 것이 남지 않는다
    if (data.session) {
      setStep("verified");
      setBusy(false);
      return;
    }

    setStep("sent");
    setLeft(RESEND_WAIT);
    setBusy(false);
  };

  // ---------------------------------------------------------------- 2. 인증번호 확인

  const verifyCode = async () => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    const { error } = await supabaseBrowser()!.auth.verifyOtp({
      email,
      token: otp,
      type: "signup",
    });

    if (error) {
      setError(authMessage(error.message));
      setBusy(false);
      return;
    }

    setStep("verified");
    setBusy(false);
  };

  // ---------------------------------------------------------------- 3. 가입 신청

  /**
   * 인증을 마친 뒤라 이미 로그인 상태다. 여기서 하는 일은 둘.
   *   - 번호를 받은 뒤에 고친 칸이 있으면 계정에 실제로 반영한다
   *   - 초대코드를 쓴다 (여기서 처음 사용 횟수가 올라간다)
   */
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== "verified") return;

    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    const supabase = supabaseBrowser()!;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("로그인 정보를 읽지 못했습니다. 새로고침한 뒤 다시 시도해주세요.");
      setBusy(false);
      return;
    }

    // 화면에 적힌 비밀번호가 진짜가 되게 한다.
    // 이미 신청됐던 주소면 signUp이 비밀번호를 바꾸지 않고 지나가므로 여기서 맞춰준다.
    // 바뀐 것이 없으면 Supabase가 '같은 비밀번호'라고 되돌려 보내는데, 그것은 탈이 아니다.
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError && !pwError.message.toLowerCase().includes("should be different")) {
      setError(authMessage(pwError.message));
      setBusy(false);
      return;
    }

    // 이름은 계정을 만들 때 새겨진다 — 그 뒤에 고쳤으면 여기서 따라 바꾼다
    if (sentWith && name.trim() !== sentWith.name) {
      await supabase.from("users").update({ name: name.trim() }).eq("id", user.id);
    }

    const entered = code.trim();
    if (entered) {
      const { data: ok } = await supabase.rpc("redeem_invite_code", { p_code: entered });
      // 한 번 쓴 코드는 지운다 — 승인 대기 화면이 다시 시도하지 않게
      await supabase.auth.updateUser({ data: { invite_code: null } });

      if (ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      // 번호를 넣는 사이에 코드가 만료됐다. 관리자 승인으로 돌린다.
      router.replace("/pending?code=invalid");
      router.refresh();
      return;
    }

    router.replace("/pending");
    router.refresh();
  };

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
            onChange={(e) => changeEmail(e.target.value)}
          />
        </Field>
        <Field label={`비밀번호 (${MIN_PASSWORD}자 이상)`}>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="비밀번호 다시 넣기">
          <input
            type="password"
            value={password2}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            onChange={(e) => setPassword2(e.target.value)}
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

        {/*
          메일 인증은 따로 선 안에 둔다.
          위 칸들과 섞어두면 '적기'와 '확인받기'가 한 덩어리로 보여,
          번호가 오지 않을 때 어디서 막힌 것인지 짚을 자리가 없어진다.
        */}
        <div
          className="flex flex-col gap-2.5 rounded-xl border p-3"
          style={{
            borderColor: step === "verified" ? "#b2f2bb" : "var(--ui-border)",
            background: step === "verified" ? "#f4fcf6" : "#fbfbfc",
          }}
        >
          <span className="text-[11px] font-bold" style={{ color: "var(--ui-muted)" }}>
            이메일 인증
          </span>

          {step === "verified" ? (
            <span className="text-[12px] font-semibold" style={{ color: "#2b8a3e" }}>
              ✓ {email} 인증을 마쳤습니다
            </span>
          ) : (
            <>
              <Btn
                type="button"
                variant={step === "sent" ? "default" : "primary"}
                onClick={sendCode}
                disabled={busy || !filled || left > 0}
                title={filled ? undefined : "위 칸을 모두 채워야 인증번호를 보낼 수 있습니다"}
                style={{ padding: "9px 12px" }}
              >
                {left > 0
                  ? `다시 보내기 (${left}초)`
                  : step === "sent"
                    ? "인증번호 다시 보내기"
                    : "인증번호 받기"}
              </Btn>

              {/*
                잠긴 버튼은 까닭을 함께 적어야 한다.
                말없이 잠겨 있으면 고장으로 읽히고, 손가락으로 쓰는 화면에는 마우스를 올려
                설명을 볼 방법도 없다.
              */}
              {!filled && (
                <span className="text-[11px]" style={{ color: "var(--ui-muted)" }}>
                  위 칸을 모두 채우면 눌립니다.
                </span>
              )}

              {step === "sent" && (
                <div className="flex items-start gap-2">
                  <input
                    type="text"
                    value={otp}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={CODE_LENGTH}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
                    }
                    // 번호를 다 넣고 엔터를 치는 것이 자연스럽다.
                    // 그냥 두면 폼이 대신 제출되는데 그 버튼은 아직 잠겨 있어 아무 일도 안 일어난다.
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (!busy && otp.length === CODE_LENGTH) void verifyCode();
                    }}
                    style={{ fontSize: 18, fontWeight: 700, letterSpacing: 6, textAlign: "center" }}
                  />
                  {/* 폼 안이므로 type을 적어야 한다 — 안 적으면 눌렀을 때 가입 신청이 함께 돌아간다 */}
                  <Btn
                    type="button"
                    variant="primary"
                    onClick={verifyCode}
                    disabled={busy || otp.length < CODE_LENGTH}
                    style={{ padding: "9px 14px", minHeight: 40 }}
                  >
                    확인
                  </Btn>
                </div>
              )}
            </>
          )}
        </div>

        <AuthNotice message={notice} />
        <AuthError message={error} />

        <Btn
          type="submit"
          variant="primary"
          disabled={busy || step !== "verified"}
          title={step === "verified" ? undefined : "이메일 인증을 마쳐야 신청할 수 있습니다"}
          style={{ padding: "10px 12px" }}
        >
          {busy ? "처리 중…" : "가입 신청"}
        </Btn>

        {step !== "verified" && (
          <span className="text-center text-[11px]" style={{ color: "var(--ui-muted)" }}>
            이메일 인증을 마치면 눌립니다.
          </span>
        )}

        <Hint>
          메일이 안 보이면 스팸함도 확인해보세요. 초대코드는 발급 후 24시간 동안만 쓸 수 있습니다.
        </Hint>
      </form>
    </AuthShell>
  );
}
