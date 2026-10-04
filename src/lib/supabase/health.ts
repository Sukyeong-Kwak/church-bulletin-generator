"use client";

import { supabaseBrowser } from "./client";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * 서버(Supabase)와 제대로 이어져 있는지 직접 물어본다.
 *
 * 저장이 실패했을 때 "인터넷 연결을 확인하세요"만으로는 쓰는 사람이 할 수 있는 일이 없다.
 * 내 인터넷이 끊긴 것인지, 서버가 아예 대답을 안 하는 것인지, 대답은 했는데 거절한 것인지
 * (로그인 만료·권한·서버 오류)는 손쓸 방법이 저마다 다르다. 그래서 그 셋을 갈라 낸다.
 *
 *   응답 없음   요청이 서버에 닿지 못했거나, 기다려도 돌아오지 않았다 — 상태 코드 자체가 없다
 *   응답 있음   서버가 상태 코드를 돌려줬다 — 400이든 500이든 서버는 살아 있다
 *
 * supabase-js 를 거치지 않고 fetch 를 직접 쓴다. 그쪽은 연결 실패도 오류 객체 하나로 뭉쳐
 * 돌려주므로, '응답이 없었다'와 '응답이 오류였다'를 확실하게 가를 수 없다.
 */

/** 이만큼 기다려도 안 오면 '응답 없음'으로 본다 */
export const PROBE_TIMEOUT_MS = 8000;

/** 이보다 오래 걸리면 이어져 있어도 느리다고 알린다 */
const SLOW_MS = 3000;

export type Health =
  /** 정상 */
  | { kind: "ok"; ms: number; slow: boolean }
  /** 이 기기가 인터넷에 연결되어 있지 않다 */
  | { kind: "offline" }
  /** 응답 없음 — 서버에 닿지 못했다. 같은 때 우리 앱 서버는 닿았는지도 함께 적는다 */
  | { kind: "unreachable"; reason: "timeout" | "network"; appReachable: boolean; detail?: string }
  /** 응답 있음 — 서버가 오류 코드를 돌려줬다 */
  | { kind: "http"; status: number; ms: number; message?: string; code?: string }
  /** 응답은 정상인데 로그인이 없다(세션이 풀렸다) */
  | { kind: "no-session" }
  /** 응답은 정상인데 읽을 수 있는 것이 없다 — 승인이 풀렸거나 권한이 없다 */
  | { kind: "no-access"; ms: number };

async function timedFetch(url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 우리 앱 서버(Vercel)에는 닿는가.
 * Supabase 만 안 닿고 여기는 닿으면, 내 인터넷이 아니라 Supabase 쪽 문제다.
 */
async function appReachable(): Promise<boolean> {
  try {
    const res = await timedFetch("/robots.txt", { method: "HEAD" });
    return res.status > 0;
  } catch {
    return false;
  }
}

/** PostgREST 가 돌려주는 오류 본문에서 사람이 읽을 말과 코드를 꺼낸다 */
async function readError(res: Response): Promise<{ message?: string; code?: string }> {
  const text = await res.text().catch(() => "");
  if (!text) return {};
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const message = [body.message, body.msg, body.error_description, body.error, body.hint].find(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    const code = typeof body.code === "string" || typeof body.code === "number" ? String(body.code) : undefined;
    return { message, code };
  } catch {
    // JSON 이 아니면(게이트웨이 오류 페이지 등) 앞부분만 남긴다
    return { message: text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) };
  }
}

export async function probeHealth(): Promise<Health> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };

  const supabase = supabaseBrowser();
  if (!supabase) return { kind: "ok", ms: 0, slow: false };

  // 세션은 브라우저 쿠키에서 읽는다 — 만료가 가까우면 여기서 새로 받아 온다
  let token: string | undefined;
  let sessionStalled = false;
  // 토큰을 새로 받으러 간 길이 막히면 여기서 멈춰 버린다 — 오래 기다리지 않는다
  try {
    const session = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session),
      new Promise<"stalled">((resolve) => setTimeout(() => resolve("stalled"), PROBE_TIMEOUT_MS)),
    ]);
    if (session === "stalled") sessionStalled = true;
    else token = session?.access_token;
  } catch {
    // 새 토큰을 받으러 가다 실패한 것 — 아래 요청이 같은 이유로 실패하며 원인을 드러낸다
  }

  const started = performance.now();
  let res: Response;
  try {
    // 설정 행 하나 — 로그인과 승인이 모두 살아 있어야 보이는 가장 가벼운 읽기다
    res = await timedFetch(`${SUPABASE_URL}/rest/v1/settings?select=id&id=eq.1`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      },
    });
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "AbortError";
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
    return {
      kind: "unreachable",
      reason: timeout ? "timeout" : "network",
      appReachable: await appReachable(),
      detail: timeout ? undefined : e instanceof Error ? e.message : String(e),
    };
  }
  const ms = Math.round(performance.now() - started);

  if (!res.ok) return { kind: "http", status: res.status, ms, ...(await readError(res)) };

  // 성공 응답이어도 행이 없으면 RLS 에 막힌 것이다 — 오류 없이 빈 목록이 온다
  const rows = (await res.json().catch(() => [])) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    // 로그인 서버가 대답을 안 해 토큰 없이 물어본 것이다 — 로그인이 풀린 것과는 다르다
    if (sessionStalled)
      return { kind: "unreachable", reason: "timeout", appReachable: true, detail: "로그인 갱신이 돌아오지 않음" };
    return token ? { kind: "no-access", ms } : { kind: "no-session" };
  }

  return { kind: "ok", ms, slow: ms > SLOW_MS };
}

export interface HealthMessage {
  tone: "warn" | "error";
  /** 무슨 일인지 */
  title: string;
  /** 무엇을 하면 되는지 */
  action: string;
  /** 응답이 있었는지 없었는지와 코드 — 관리자에게 그대로 전할 수 있게 */
  tech: string;
}

/** 정상이면 null */
export function describeHealth(h: Health): HealthMessage | null {
  switch (h.kind) {
    case "ok":
      return h.slow
        ? {
            tone: "warn",
            title: "서버 응답이 느립니다",
            action: "저장이 오래 걸릴 수 있습니다. 저장 버튼이 '저장됨'으로 바뀌는지 확인해 주세요.",
            tech: `응답 있음 · 정상 · ${h.ms}ms`,
          }
        : null;

    case "offline":
      return {
        tone: "error",
        title: "이 기기가 인터넷에 연결되어 있지 않습니다",
        action: "와이파이나 랜선을 확인해 주세요. 연결되면 자동으로 다시 확인합니다. 그 전까지 저장되지 않습니다.",
        tech: "응답 없음 · 브라우저가 오프라인 상태",
      };

    case "unreachable": {
      const waited = `${PROBE_TIMEOUT_MS / 1000}초`;
      const how = h.reason === "timeout" ? `${waited} 동안 기다렸지만 돌아오지 않음` : "연결 자체가 실패함";
      return h.appReachable
        ? {
            tone: "error",
            title: "데이터 서버가 응답하지 않습니다",
            action:
              "인터넷은 연결되어 있지만 데이터 서버(Supabase)에 닿지 않습니다. 서버가 멈췄거나 일시 정지된 상태일 수 있습니다 — 관리자에게 알려 주세요. 그 전까지 저장되지 않습니다.",
            tech: `응답 없음 · ${how}${h.detail ? ` (${h.detail})` : ""}`,
          }
        : {
            tone: "error",
            title: "서버에 닿지 않습니다",
            action: "인터넷 연결이 불안정하거나 끊긴 것 같습니다. 연결을 확인해 주세요. 그 전까지 저장되지 않습니다.",
            tech: `응답 없음 · ${how} · 앱 서버도 닿지 않음`,
          };
    }

    case "no-session":
      return {
        tone: "error",
        title: "로그인이 풀렸습니다",
        action: "다시 로그인해 주세요. 작성 중인 내용은 이 브라우저에 남아 있습니다.",
        tech: "응답 있음 · 로그인 정보 없음",
      };

    case "no-access":
      return {
        tone: "error",
        title: "데이터를 볼 권한이 없습니다",
        action: "계정 승인이 취소되었을 수 있습니다. 관리자에게 문의해 주세요.",
        tech: `응답 있음 · 200 · 읽을 수 있는 행 없음 · ${h.ms}ms`,
      };

    case "http": {
      const tech = `응답 있음 · HTTP ${h.status}${h.code ? ` (${h.code})` : ""}${h.message ? ` · ${h.message}` : ""}`;
      const { title, action } = httpCause(h.status);
      return { tone: "error", title, action, tech };
    }
  }
}

function httpCause(status: number): { title: string; action: string } {
  if (status === 401)
    return {
      title: "로그인이 만료되었습니다",
      action: "다시 로그인해 주세요. 작성 중인 내용은 이 브라우저에 남아 있습니다.",
    };
  if (status === 403)
    return { title: "서버가 접근을 거절했습니다", action: "권한이 없는 계정입니다. 관리자에게 문의해 주세요." };
  if (status === 404)
    return {
      title: "서버 주소가 맞지 않습니다",
      action: "앱의 서버 설정(Supabase 주소)이 잘못되었거나 테이블이 없습니다. 관리자에게 알려 주세요.",
    };
  if (status === 429)
    return { title: "요청이 너무 많습니다", action: "잠시 뒤 자동으로 다시 확인합니다." };
  if (status === 503 || status === 540)
    return {
      title: "데이터 서버가 멈춰 있습니다",
      action:
        "서버가 응답은 하지만 일을 받지 않고 있습니다. 무료 요금제에서 오래 쓰지 않아 일시 정지되었을 수 있습니다 — 관리자에게 알려 주세요.",
    };
  if (status >= 500)
    return { title: "데이터 서버에 오류가 났습니다", action: "잠시 뒤 다시 시도해 주세요. 계속되면 관리자에게 알려 주세요." };
  return {
    title: "서버가 요청을 받아들이지 않았습니다",
    action: "앱과 서버의 설정이 맞지 않을 수 있습니다. 관리자에게 아래 내용을 전해 주세요.",
  };
}

/* ------------------------------------------------------------------ 로그인 전 점검 */

/**
 * 한 자리에 물어본 결과.
 *   ok           정상으로 대답했다
 *   no-response  대답이 없었다 — 상태 코드 자체가 없다
 *   http         대답은 했는데 오류 코드였다
 */
export type Layer =
  | { state: "ok"; ms: number }
  | { state: "no-response"; reason: "timeout" | "network"; detail?: string }
  | { state: "http"; status: number; ms: number; message?: string; code?: string };

/**
 * 로그인 전에 쓰는 점검. 세 자리를 따로 물어 어디서 끊겼는지 짚는다.
 *
 *   app   우리 앱 서버(Vercel)   — 여기까지 안 닿으면 이 기기의 인터넷 문제다
 *   auth  Supabase 로그인 서버   — 비밀번호를 확인하는 곳
 *   db    Supabase 데이터베이스  — 로그인 뒤 모든 것이 여기서 나온다
 *
 * 로그인은 auth 만 거치지만, 로그인한 다음 계정 상태를 db 에서 읽는다.
 * 둘 중 하나만 죽어도 들어갈 수 없으므로 함께 본다.
 *
 * 로그인 없이 물을 수 있는 것만 쓴다 — auth 는 /health, db 는 익명에게도 열린
 * invite_required() 다. 진짜로 쿼리를 한 번 돌려야 '데이터베이스가 동작한다'고 말할 수 있다.
 */
export interface Diagnosis {
  offline: boolean;
  app: Layer;
  auth: Layer;
  db: Layer;
}

async function checkLayer(url: string, init: RequestInit = {}): Promise<Layer> {
  const started = performance.now();
  try {
    const res = await timedFetch(url, init);
    const ms = Math.round(performance.now() - started);
    if (res.ok) return { state: "ok", ms };
    return { state: "http", status: res.status, ms, ...(await readError(res)) };
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === "AbortError";
    return {
      state: "no-response",
      reason: timeout ? "timeout" : "network",
      detail: timeout ? undefined : e instanceof Error ? e.message : String(e),
    };
  }
}

export async function diagnoseServers(): Promise<Diagnosis> {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const key = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

  const [app, auth, db] = await Promise.all([
    checkLayer("/robots.txt", { method: "HEAD" }),
    checkLayer(`${SUPABASE_URL}/auth/v1/health`, { headers: key }),
    checkLayer(`${SUPABASE_URL}/rest/v1/rpc/invite_required`, {
      method: "POST",
      headers: { ...key, "Content-Type": "application/json" },
      body: "{}",
    }),
  ]);
  return { offline, app, auth, db };
}

const LAYER_NAME = { app: "앱 서버", auth: "로그인 서버", db: "데이터베이스" } as const;

/** 한 줄 요약 — 응답이 있었는지 없었는지부터 적는다 */
export function layerLine(name: keyof typeof LAYER_NAME, l: Layer): string {
  const head = LAYER_NAME[name];
  if (l.state === "ok") return `${head}: 정상 (${l.ms}ms)`;
  if (l.state === "no-response") {
    const how =
      l.reason === "timeout"
        ? `${PROBE_TIMEOUT_MS / 1000}초 동안 기다렸지만 돌아오지 않음`
        : `연결 실패${l.detail ? ` (${l.detail})` : ""}`;
    return `${head}: 응답 없음 · ${how}`;
  }
  return `${head}: 응답 있음 · HTTP ${l.status}${l.code ? ` (${l.code})` : ""}${l.message ? ` · ${l.message}` : ""}`;
}

export interface DiagnosisMessage {
  title: string;
  action: string;
  /** 자리마다 한 줄씩 */
  lines: string[];
}

const paused = (l: Layer) => l.state === "http" && (l.status === 503 || l.status === 540);
const dead = (l: Layer) => l.state === "no-response" || (l.state === "http" && l.status >= 500);

/** 모두 정상이면 null */
export function describeDiagnosis(d: Diagnosis): DiagnosisMessage | null {
  const lines = [layerLine("app", d.app), layerLine("auth", d.auth), layerLine("db", d.db)];
  const bad = (l: Layer) => l.state !== "ok";

  if (d.offline)
    return {
      title: "이 기기가 인터넷에 연결되어 있지 않습니다",
      action: "와이파이나 랜선을 확인한 뒤 다시 시도해 주세요.",
      lines,
    };

  if (!bad(d.app) && !bad(d.auth) && !bad(d.db)) return null;

  // 앱 서버까지 안 닿는다 — 저쪽이 아니라 이쪽 인터넷이다
  if (d.app.state === "no-response" && d.auth.state === "no-response" && d.db.state === "no-response")
    return {
      title: "인터넷 연결이 불안정합니다",
      action: "어느 서버에도 닿지 않습니다. 이 기기의 인터넷 연결을 확인해 주세요.",
      lines,
    };

  if (paused(d.auth) || paused(d.db))
    return {
      title: "데이터 서버가 멈춰 있습니다",
      action:
        "서버가 응답은 하지만 일을 받지 않고 있습니다. 무료 요금제에서 오래 쓰지 않아 일시 정지되었을 수 있습니다. 관리자가 Supabase 대시보드에서 프로젝트를 다시 켜야 합니다.",
      lines,
    };

  if (d.auth.state === "no-response" && d.db.state === "no-response")
    return {
      title: "데이터 서버(Supabase)가 응답하지 않습니다",
      action:
        "인터넷은 연결되어 있지만 Supabase 서버 전체가 대답하지 않습니다. 서버 장애이거나, 앱에 넣어 둔 서버 주소가 잘못되었을 수 있습니다. 관리자에게 아래 내용을 전해 주세요.",
      lines,
    };

  if (!bad(d.auth) && bad(d.db))
    return {
      title: dead(d.db) ? "데이터베이스가 동작하지 않습니다" : "데이터베이스가 요청을 거절했습니다",
      action:
        "로그인 서버는 살아 있지만 데이터베이스가 정상적으로 대답하지 않아, 로그인해도 주보를 불러올 수 없습니다. 관리자에게 아래 내용을 전해 주세요.",
      lines,
    };

  if (bad(d.auth) && !bad(d.db))
    return {
      title: dead(d.auth) ? "로그인 서버가 동작하지 않습니다" : "로그인 서버가 요청을 거절했습니다",
      action:
        "데이터베이스는 살아 있지만 로그인(비밀번호 확인)을 맡은 서버가 정상적으로 대답하지 않습니다. 관리자에게 아래 내용을 전해 주세요.",
      lines,
    };

  if (d.auth.state === "http" && d.auth.status === 401 && d.db.state === "http" && d.db.status === 401)
    return {
      title: "앱의 서버 키가 맞지 않습니다",
      action: "서버는 대답하지만 앱에 넣어 둔 접속 키를 받아들이지 않습니다. 관리자가 환경변수를 확인해야 합니다.",
      lines,
    };

  if (d.app.state !== "ok" && !bad(d.auth) && !bad(d.db))
    return {
      title: "앱 서버가 정상적으로 대답하지 않습니다",
      action: "데이터 서버는 정상입니다. 새로고침한 뒤 다시 시도해 주세요.",
      lines,
    };

  return {
    title: "서버가 정상적으로 대답하지 않습니다",
    action: "잠시 뒤 다시 시도해 주세요. 계속되면 관리자에게 아래 내용을 전해 주세요.",
    lines,
  };
}
