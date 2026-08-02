"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AppUser, InviteCode } from "@/lib/supabase/types";
import { Btn, Hint, Section } from "../ui";

/** 24시간 뒤 만료 */
const CODE_TTL_HOURS = 24;

function makeCode(): string {
  // 헷갈리는 글자(0/O, 1/I)는 빼고 8자리
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

const STATUS_LABEL: Record<AppUser["status"], string> = {
  pending: "승인 대기",
  approved: "이용 중",
  rejected: "거절됨",
  blocked: "이용 중지됨",
};

/**
 * 메일 인증 여부.
 * 승인 버튼을 누르기 전에 '이 메일 주소가 정말 이 사람 것인지'를 여기서 확인한다.
 *
 * 003 마이그레이션을 아직 안 돌렸으면 이 값 자체가 없다(undefined). 그때는 아무 말도 하지 않는다 —
 * 모두를 '인증 전'으로 보고 승인 버튼을 잠그면 관리자가 아무도 들이지 못하게 된다.
 */
function MailBadge({ at }: { at: string | null | undefined }) {
  if (at === undefined) return null;
  const ok = !!at;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={
        ok
          ? { background: "#ebfbee", color: "#2b8a3e" }
          : { background: "#fff4e6", color: "#b45309" }
      }
      title={ok ? `${new Date(at).toLocaleString("ko-KR")} 확인` : "아직 메일 링크를 누르지 않았습니다"}
    >
      {ok ? "메일 인증됨" : "메일 인증 전"}
    </span>
  );
}

export function AdminPanel({ meId }: { meId: string }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const [u, c] = await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("invite_codes").select("*").order("created_at", { ascending: false }).limit(20),
    ]);

    if (u.data) setUsers(u.data);
    if (c.data) setCodes(c.data);
  }, []);

  // 목록은 서버에 물어봐야 알 수 있어 첫 렌더 뒤에 채운다
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setStatus = async (id: string, status: AppUser["status"]) => {
    setBusy(true);
    setError(undefined);
    const supabase = supabaseBrowser()!;
    const { error } = await supabase
      .from("users")
      .update({
        status,
        approved_by: status === "approved" ? meId : null,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) setError(error.message);
    await load();
    setBusy(false);
  };

  const setRole = async (id: string, role: AppUser["role"]) => {
    setBusy(true);
    const supabase = supabaseBrowser()!;
    const { error } = await supabase.from("users").update({ role }).eq("id", id);
    if (error) setError(error.message);
    await load();
    setBusy(false);
  };

  const issueCode = async () => {
    setBusy(true);
    setError(undefined);
    const supabase = supabaseBrowser()!;
    const expires = new Date(Date.now() + CODE_TTL_HOURS * 3600 * 1000).toISOString();
    const { error } = await supabase.from("invite_codes").insert({
      code: makeCode(),
      created_by: meId,
      expires_at: expires,
      max_uses: 10,
    });
    if (error) setError(error.message);
    await load();
    setBusy(false);
  };

  const revoke = async (id: string) => {
    setBusy(true);
    const supabase = supabaseBrowser()!;
    await supabase.from("invite_codes").update({ revoked: true }).eq("id", id);
    await load();
    setBusy(false);
  };

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:p-5">
      {error && (
        <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "#fff5f5", color: "#c92a2a" }}>
          {error}
        </p>
      )}

      <Section title={`가입 신청 ${pending.length}건`} desc="승인해야 주보를 만들 수 있습니다.">
        {pending.length === 0 ? (
          <Hint>대기 중인 신청이 없습니다.</Hint>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
                style={{ borderColor: "var(--ui-border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-bold">
                    {u.name || "(이름 없음)"}
                    <MailBadge at={u.email_confirmed_at} />
                  </p>
                  <p className="truncate text-[11px]" style={{ color: "var(--ui-muted)" }}>
                    {u.email} · {new Date(u.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <Btn
                  size="sm"
                  variant="primary"
                  disabled={busy || u.email_confirmed_at === null}
                  title={
                    u.email_confirmed_at === null ? "메일 인증을 마쳐야 승인할 수 있습니다" : undefined
                  }
                  onClick={() => setStatus(u.id, "approved")}
                >
                  승인
                </Btn>
                <Btn size="sm" variant="danger" disabled={busy} onClick={() => setStatus(u.id, "rejected")}>
                  거절
                </Btn>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="초대코드"
        desc={`발급 후 ${CODE_TTL_HOURS}시간, 최대 10명까지 쓸 수 있습니다. 단톡방에 공유하면 승인 없이 바로 시작합니다.`}
        right={
          <Btn size="sm" variant="primary" disabled={busy} onClick={issueCode}>
            + 코드 발급
          </Btn>
        }
      >
        {codes.length === 0 ? (
          <Hint>아직 발급한 코드가 없습니다.</Hint>
        ) : (
          <div className="flex flex-col gap-1.5">
            {codes.map((c) => {
              const expired = new Date(c.expires_at) < new Date();
              const dead = c.revoked || expired || c.used_count >= c.max_uses;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
                  style={{ borderColor: "var(--ui-border)", opacity: dead ? 0.5 : 1 }}
                >
                  <code className="text-[15px] font-bold tracking-widest">{c.code}</code>
                  <span className="text-[11px]" style={{ color: "var(--ui-muted)" }}>
                    {c.used_count}/{c.max_uses}명 ·{" "}
                    {c.revoked
                      ? "폐기됨"
                      : expired
                        ? "만료됨"
                        : `${new Date(c.expires_at).toLocaleString("ko-KR")}까지`}
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    {!dead && (
                      <>
                        <Btn
                          size="sm"
                          onClick={() => void navigator.clipboard.writeText(c.code)}
                        >
                          복사
                        </Btn>
                        <Btn size="sm" variant="danger" disabled={busy} onClick={() => revoke(c.id)}>
                          폐기
                        </Btn>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title={`구성원 ${others.length}명`}
        desc="차단하면 로그인해도 주보를 열거나 고칠 수 없습니다. 계정과 만들어둔 주보는 남습니다."
      >
        <div className="flex flex-col gap-1.5">
          {others.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
              style={{ borderColor: "var(--ui-border)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-bold">
                  {u.name || "(이름 없음)"}
                  {u.id === meId && (
                    <span className="text-[11px]" style={{ color: "var(--ui-accent)" }}>
                      나
                    </span>
                  )}
                  <MailBadge at={u.email_confirmed_at} />
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--ui-muted)" }}>
                  {u.email} · {STATUS_LABEL[u.status]}
                </p>
              </div>

              <select
                value={u.role}
                disabled={busy || u.id === meId}
                onChange={(e) => setRole(u.id, e.target.value as AppUser["role"])}
                style={{ width: "auto" }}
              >
                <option value="editor">편집자</option>
                <option value="admin">관리자</option>
              </select>

              {/* 자기 자신은 막지 못한다 — 마지막 관리자가 스스로를 잠그면 되살릴 사람이 없다 */}
              {u.id !== meId &&
                (u.status === "blocked" ? (
                  <Btn size="sm" variant="primary" disabled={busy} onClick={() => setStatus(u.id, "approved")}>
                    차단 해제
                  </Btn>
                ) : (
                  <>
                    {u.status !== "approved" && (
                      <Btn size="sm" variant="primary" disabled={busy} onClick={() => setStatus(u.id, "approved")}>
                        다시 승인
                      </Btn>
                    )}
                    <Btn
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      title="로그인해도 아무것도 할 수 없게 막습니다. 계정과 주보는 지워지지 않습니다."
                      onClick={() => setStatus(u.id, "blocked")}
                    >
                      로그인 차단
                    </Btn>
                  </>
                ))}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
