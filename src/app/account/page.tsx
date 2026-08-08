"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthError, AuthNotice, AuthShell } from "@/components/auth/AuthShell";
import { authMessage } from "@/components/auth/messages";
import { Btn, Field, Hint } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/config";
import { NotConfigured } from "../login/page";

/** 비밀번호 최소 길이 — 가입·재설정 화면과 같은 값이어야 한다 */
const MIN_LENGTH = 8;

/**
 * 내 계정 — 지금 쓰는 비밀번호를 스스로 바꾸는 자리.
 *
 * 잊어버렸을 때의 재설정(/reset-password)과는 쓰임이 다르다.
 * 그쪽은 메일함을 거쳐야 하지만, 여기는 이미 들어와 있는 사람이 그 자리에서 바꾼다.
 *
 * 지금 비밀번호를 한 번 더 묻는 까닭:
 * Supabase는 로그인만 되어 있으면 옛 비밀번호 없이도 바꿔준다. 그런데 이 앱은
 * 교회 사무실 컴퓨터 하나를 여럿이 쓰는 자리에서 돌아간다 — 로그아웃을 잊고 자리를 뜨면
 * 지나가던 사람이 남의 계정을 통째로 가져갈 수 있다. 그 한 걸음을 막는다.
 */
export default function AccountPage() {
  const [email, setEmail] = useState<string>();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // 지금 비밀번호를 확인하려면 다시 로그인해 봐야 하고, 그러려면 내 메일 주소가 있어야 한다
  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    let alive = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? undefined);
    });

    return () => {
      alive = false;
    };
  }, []);

  if (!supabaseConfigured) return <NotConfigured />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setDone(false);

    if (next.length < MIN_LENGTH) {
      setError(`새 비밀번호는 ${MIN_LENGTH}자 이상으로 정해주세요.`);
      return;
    }
    // 눈에 보이지 않는 칸이라 오타를 알아챌 방법이 없다. 두 번 받아 맞춰본다.
    if (next !== again) {
      setError("새 비밀번호가 서로 다릅니다. 두 칸을 같게 넣어주세요.");
      return;
    }
    if (next === current) {
      setError("지금 쓰는 비밀번호와 다른 것으로 정해주세요.");
      return;
    }
    if (!email) {
      setError("로그인 정보를 읽지 못했습니다. 새로고침한 뒤 다시 시도해주세요.");
      return;
    }

    setBusy(true);
    const supabase = supabaseBrowser()!;

    // 본인이 맞는지부터 확인한다. 같은 사람으로 다시 들어오는 것이라 세션은 그대로다.
    const { error: wrong } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (wrong) {
      // 틀린 비밀번호와 '너무 자주 시도해서 막힌 것'은 다르다.
      // 한데 묶으면 맞는 비밀번호를 넣고도 틀렸다는 말만 보며 계속 다시 넣게 된다.
      setError(
        wrong.message.toLowerCase().includes("invalid login")
          ? "지금 쓰는 비밀번호가 맞지 않습니다."
          : authMessage(wrong.message),
      );
      setBusy(false);
      return;
    }

    const { error: failed } = await supabase.auth.updateUser({ password: next });
    if (failed) {
      setError(authMessage(failed.message));
      setBusy(false);
      return;
    }

    setCurrent("");
    setNext("");
    setAgain("");
    setDone(true);
    setBusy(false);
  };

  return (
    <AuthShell
      title="비밀번호 바꾸기"
      desc={email}
      footer={
        <Link href="/" style={{ color: "var(--ui-muted)" }}>
          주보 만들기로 돌아가기
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        {/* 비밀번호 관리자가 어느 계정인지 알아보도록 메일 주소를 숨겨서 함께 둔다 */}
        <input type="hidden" name="username" autoComplete="username" value={email ?? ""} readOnly />

        <Field label="지금 쓰는 비밀번호">
          <input
            type="password"
            value={current}
            required
            autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label={`새 비밀번호 (${MIN_LENGTH}자 이상)`}>
          <input
            type="password"
            value={next}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="새 비밀번호 다시 넣기">
          <input
            type="password"
            value={again}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>

        <AuthError message={error} />
        <AuthNotice message={done ? "비밀번호를 바꿨습니다." : undefined} />

        <Btn type="submit" variant="primary" disabled={busy} style={{ padding: "10px 12px" }}>
          {busy ? "바꾸는 중…" : "비밀번호 바꾸기"}
        </Btn>
      </form>

      <Hint>
        비밀번호를 잊어 들어오지 못하는 경우라면 로그인 화면의 <b>비밀번호를 잊으셨나요?</b>를
        쓰세요. 메일로 재설정 링크를 보내드립니다.
      </Hint>
    </AuthShell>
  );
}
