"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDoc } from "@/lib/store";
import { supabaseConfigured } from "@/lib/supabase/config";
import { describeHealth, probeHealth, type Health } from "@/lib/supabase/health";
import { Btn } from "./ui";

/** 잘 이어져 있을 때 다시 물어보는 간격 — 화면을 켜 둔 채 자리를 비워도 부담이 없을 만큼 */
const OK_EVERY_MS = 60_000;
/** 끊겨 있을 때는 자주 물어 돌아오는 대로 걷어낸다 */
const BAD_EVERY_MS = 15_000;
/** 되살아났다는 말을 띄워 두는 시간 */
const RECOVERED_MS = 3000;

const SKIN = {
  warn: { bg: "#fff9db", fg: "#8a6100", bd: "#ffe8a3" },
  error: { bg: "#fff5f5", fg: "#c92a2a", bd: "#ffc9c9" },
  success: { bg: "#f4fcf6", fg: "#1e6b32", bd: "#b2f2bb" },
};

/**
 * 서버와의 연결이 끊기거나 이상할 때 머리줄 바로 아래에 띠를 띄워 이유를 알린다.
 *
 * 저장 버튼을 눌러 실패해야 비로소 알게 되면 늦다 — 그사이 고친 것이 서버에 하나도 없다.
 * 그래서 화면이 열려 있는 동안 스스로 물어보고, 다음 때에도 곧바로 다시 확인한다.
 *   - 화면을 다시 볼 때(탭 전환·창 복귀)
 *   - 브라우저가 인터넷 연결이 바뀌었다고 알릴 때
 *   - 저장·불러오기 같은 일이 실패했을 때
 */
export function ConnectionStatus() {
  const { error } = useDoc();
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const wasBad = useRef(false);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (!supabaseConfigured || running.current) return;
    running.current = true;
    setChecking(true);
    try {
      const h = await probeHealth();
      const bad = describeHealth(h)?.tone === "error";
      // 끊겼다가 돌아온 것만 알린다 — 처음부터 괜찮았으면 아무 말도 하지 않는다
      if (wasBad.current && !bad) setRecovered(true);
      wasBad.current = bad;
      setHealth(h);
    } finally {
      running.current = false;
      setChecking(false);
    }
  }, []);

  // 처음 한 번, 그리고 상태에 맞는 간격으로
  const bad = health ? describeHealth(health)?.tone === "error" : false;
  useEffect(() => {
    if (!supabaseConfigured) return;
    const first = setTimeout(() => void check(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, bad ? BAD_EVERY_MS : OK_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [check, bad]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onNet = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onNet);
    window.addEventListener("offline", onNet);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onNet);
      window.removeEventListener("offline", onNet);
    };
  }, [check]);

  // 무언가 실패했다 — 연결 탓인지 바로 확인해 이유를 함께 보여준다
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => void check(), 0);
    return () => clearTimeout(t);
  }, [error, check]);

  useEffect(() => {
    if (!recovered) return;
    const t = setTimeout(() => setRecovered(false), RECOVERED_MS);
    return () => clearTimeout(t);
  }, [recovered]);

  if (!supabaseConfigured || !health) return null;

  const msg = describeHealth(health);

  if (!msg) {
    if (!recovered) return null;
    return (
      <Band skin={SKIN.success}>
        <span className="font-semibold">✓ 서버와 다시 연결되었습니다</span>
      </Band>
    );
  }

  return (
    <Band skin={SKIN[msg.tone]} role={msg.tone === "error" ? "alert" : "status"}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">! {msg.title}</div>
        <div className="mt-0.5">{msg.action}</div>
        {/* 쓰는 사람이 관리자에게 그대로 옮길 수 있도록 — 응답이 있었는지, 있었다면 무슨 코드였는지 */}
        <div className="mt-1 font-mono text-[11px] opacity-80">{msg.tech}</div>
      </div>
      <Btn size="sm" disabled={checking} onClick={() => void check()}>
        {checking ? "확인 중…" : "다시 확인"}
      </Btn>
    </Band>
  );
}

function Band({
  skin,
  role,
  children,
}: {
  skin: { bg: string; fg: string; bd: string };
  role?: "alert" | "status";
  children: React.ReactNode;
}) {
  return (
    <div
      role={role ?? "status"}
      className="flex shrink-0 items-start gap-3 border-b px-3 py-2 text-[12.5px] leading-snug sm:px-4"
      style={{ background: skin.bg, color: skin.fg, borderColor: skin.bd }}
    >
      {children}
    </div>
  );
}
