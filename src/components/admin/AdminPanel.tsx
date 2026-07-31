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
                  <p className="text-[13px] font-bold">{u.name || "(이름 없음)"}</p>
                  <p className="truncate text-[11px]" style={{ color: "var(--ui-muted)" }}>
                    {u.email} · {new Date(u.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <Btn size="sm" variant="primary" disabled={busy} onClick={() => setStatus(u.id, "approved")}>
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

      <Section title={`구성원 ${others.length}명`}>
        <div className="flex flex-col gap-1.5">
          {others.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
              style={{ borderColor: "var(--ui-border)" }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold">
                  {u.name || "(이름 없음)"}
                  {u.id === meId && (
                    <span className="ml-1.5 text-[11px]" style={{ color: "var(--ui-accent)" }}>
                      나
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--ui-muted)" }}>
                  {u.email} · {u.status === "approved" ? "이용 중" : "거절됨"}
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

              {u.status === "approved" ? (
                u.id !== meId && (
                  <Btn size="sm" variant="danger" disabled={busy} onClick={() => setStatus(u.id, "rejected")}>
                    이용 중지
                  </Btn>
                )
              ) : (
                <Btn size="sm" variant="primary" disabled={busy} onClick={() => setStatus(u.id, "approved")}>
                  다시 승인
                </Btn>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
