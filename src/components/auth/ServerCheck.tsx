"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeDiagnosis, diagnoseServers, type Diagnosis } from "@/lib/supabase/health";
import { Btn } from "../ui";

/**
 * 로그인·가입 화면의 서버 점검.
 *
 * 로그인이 안 될 때 쓰는 사람이 볼 수 있는 것은 '실패'뿐이라, 비밀번호가 틀린 것인지
 * 서버가 죽은 것인지 알 길이 없다. 결국 개발자를 불러 콘솔을 열어야 했다.
 * 그래서 화면이 열릴 때 한 번, 그리고 로그인이 서버 탓으로 실패할 때마다 다시
 * 앱 서버·로그인 서버·데이터베이스를 따로 물어보고, 어디가 어떻게 안 되는지 그대로 적는다.
 *
 * 모두 정상이면 아무것도 그리지 않는다.
 *
 * `recheck` 가 바뀔 때마다 다시 점검한다 — 서버 탓으로 보이는 실패가 날 때 값을 바꿔 준다.
 */
export function ServerCheck({ recheck }: { recheck?: unknown }) {
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [checking, setChecking] = useState(false);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setChecking(true);
    try {
      setResult(await diagnoseServers());
    } finally {
      running.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void run(), 0);
    return () => clearTimeout(t);
  }, [run, recheck]);

  // 연결이 돌아오면 바로 다시 본다 — 띄워 둔 경고가 낡은 채 남지 않게
  useEffect(() => {
    const again = () => void run();
    window.addEventListener("online", again);
    window.addEventListener("offline", again);
    return () => {
      window.removeEventListener("online", again);
      window.removeEventListener("offline", again);
    };
  }, [run]);

  const msg = result && describeDiagnosis(result);
  if (!msg) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed"
      style={{ background: "#fff5f5", color: "#c92a2a", borderColor: "#ffc9c9" }}
    >
      <div className="font-semibold">! {msg.title}</div>
      <div className="mt-0.5">{msg.action}</div>
      {/* 관리자에게 그대로 옮길 수 있도록 — 자리마다 응답이 있었는지, 있었다면 무슨 코드였는지 */}
      <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-[11px] opacity-85">
        {msg.lines.map((l) => (
          <li key={l} className="break-all">
            {l}
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <Btn size="sm" disabled={checking} onClick={() => void run()}>
          {checking ? "확인 중…" : "다시 확인"}
        </Btn>
      </div>
    </div>
  );
}
