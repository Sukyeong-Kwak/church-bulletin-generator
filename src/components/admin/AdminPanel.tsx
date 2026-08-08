"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { AppUser, InviteCode, UserDecision } from "@/lib/supabase/types";
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

/** 이력에서 읽히는 말. 상태 이름보다 '무엇을 했는가'로 적어야 줄이 읽힌다. */
const ACTION_LABEL: Record<AppUser["status"], string> = {
  pending: "승인 대기로 되돌림",
  approved: "승인",
  rejected: "거절",
  blocked: "로그인 차단",
};

/** 사유를 반드시 받아야 하는 판단 — 사람을 막는 쪽이다 */
const NEEDS_REASON: AppUser["status"][] = ["rejected", "blocked"];

/**
 * 이력 한 줄이 무슨 일이었는지.
 *
 * 한 번의 수정으로 상태와 역할이 함께 바뀔 수 있어 둘을 이어 붙인다.
 * 역할 변경은 승인보다 큰 일이라 붉게 세운다 — 관리자를 세우고 내리는 일이기 때문이다.
 */
function decisionLabel(r: UserDecision): { text: string; danger: boolean } {
  const parts: string[] = [];

  // 거절을 되돌린 것은 그냥 승인과 다르다. 이력에서 갈라 읽혀야 한다.
  if (r.from_status === "rejected" && r.to_status === "approved") parts.push("거절 취소하고 승인");
  else if (r.from_status !== r.to_status) parts.push(ACTION_LABEL[r.to_status]);
  if (r.to_role) parts.push(r.to_role === "admin" ? "관리자로 올림" : "편집자로 내림");

  return {
    // 트리거는 둘 중 하나는 반드시 바뀌었을 때만 남기므로 여기가 비는 일은 없다
    text: parts.join(" · ") || "변경",
    danger: r.to_status === "rejected" || r.to_status === "blocked" || !!r.to_role,
  };
}

/**
 * 관리자가 하는 일은 넷이고 서로 성격이 다르다.
 * 한 화면에 다 늘어놓으면 지금 무엇을 하러 왔는지가 묻혀, 하는 일 단위로 화면을 나눈다.
 */
type TabKey = "pending" | "codes" | "members" | "history";

const TABS: { key: TabKey; label: string }[] = [
  { key: "pending", label: "가입 신청" },
  { key: "codes", label: "초대코드" },
  { key: "members", label: "구성원" },
  { key: "history", label: "이력" },
];

/** 거절·차단을 누르면 그 줄에서 까닭을 묻는다 */
type Asking = { id: string; status: AppUser["status"] };

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

/**
 * 거절·차단된 사람 표시.
 *
 * 구성원 목록에 이용 중인 사람들과 섞여 서 있으면 눈에 띄지 않는다.
 * 거절을 되돌릴 수 있는 자리가 여기뿐인데, 어느 줄이 거절된 줄인지 보이지 않으면
 * 되돌릴 방법이 없다고 여기게 된다.
 */
function StatusBadge({ status }: { status: AppUser["status"] }) {
  if (status === "approved" || status === "pending") return null;
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: "#fff5f5", color: "#c92a2a" }}
      title={
        status === "rejected"
          ? "가입을 받지 않은 계정입니다. 아래 '거절 취소하고 승인'으로 되돌릴 수 있습니다."
          : "로그인해도 아무것도 할 수 없는 계정입니다."
      }
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** 관리자를 임명하고 내릴 수 있는 단 한 사람 */
function OwnerBadge() {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: "#eef2ff", color: "#4338ca" }}
      title="관리자를 세우고 내릴 수 있는 계정입니다. 다른 관리자는 이 계정을 고칠 수 없습니다."
    >
      최고 관리자
    </span>
  );
}

/**
 * 까닭을 묻는 칸을 다루는 손잡이.
 * 목록 탭 둘이 같은 짓을 하므로 한 덩어리로 묶어 내려보낸다.
 */
type AskCtl = {
  asking?: Asking;
  reason: string;
  busy: boolean;
  setReason: (v: string) => void;
  cancel: () => void;
  confirm: () => void;
};

/**
 * 거절·차단을 누르면 그 줄에서 펼쳐지는 칸.
 *
 * 누르자마자 처리하지 않는 까닭:
 * 사람을 막는 판단은 되돌리기 어렵고, 남은 기록은 몇 달 뒤에 읽힌다.
 * 손이 한 번 더 가게 해야 잘못 누른 것과 정말 그러려던 것이 갈린다.
 */
function ReasonBox({ ctl }: { ctl: AskCtl }) {
  const status = ctl.asking!.status;
  return (
    <div className="w-full border-t pt-2.5" style={{ borderColor: "var(--ui-border)" }}>
      <p className="mb-1.5 text-[11px] font-semibold" style={{ color: "#c92a2a" }}>
        {ACTION_LABEL[status]} 사유를 적어주세요. 관리자 모두에게 이력으로 남습니다.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          autoFocus
          value={ctl.reason}
          maxLength={200}
          placeholder={
            status === "rejected" ? "예: 교인 명단에 없는 분입니다" : "예: 본인 요청으로 중지"
          }
          onChange={(e) => ctl.setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") ctl.cancel();
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (ctl.reason.trim()) ctl.confirm();
          }}
          style={{ flex: "1 1 180px", width: "auto" }}
        />
        <Btn
          size="sm"
          variant="danger"
          disabled={ctl.busy || !ctl.reason.trim()}
          onClick={ctl.confirm}
        >
          {ACTION_LABEL[status]} 확정
        </Btn>
        <Btn size="sm" variant="ghost" disabled={ctl.busy} onClick={ctl.cancel}>
          취소
        </Btn>
      </div>
    </div>
  );
}

/** 목록의 한 줄 — 탭들이 같은 테두리·간격을 쓴다 */
function Row({ children, faded }: { children: ReactNode; faded?: boolean }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5"
      style={{ borderColor: "var(--ui-border)", opacity: faded ? 0.5 : 1 }}
    >
      {children}
    </div>
  );
}

export function AdminPanel({ meId }: { meId: string }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [history, setHistory] = useState<UserDecision[]>([]);
  /** 011 마이그레이션을 아직 안 돌렸는가 — 빈 이력과 없는 표는 다른 이야기다 */
  const [noHistoryTable, setNoHistoryTable] = useState(false);
  const [tab, setTab] = useState<TabKey>("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  /** 지금 까닭을 묻고 있는 줄. 누르는 순간 바로 하지 않고 한 번 더 손을 거치게 한다. */
  const [asking, setAsking] = useState<Asking>();
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const [u, c, h] = await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("invite_codes").select("*").order("created_at", { ascending: false }).limit(20),
      // 011 마이그레이션 전이면 이 표가 없다. 그때는 이력 탭이 비어 있을 뿐 다른 탭은 그대로 돈다.
      supabase
        .from("user_decisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (u.data) setUsers(u.data);
    if (c.data) setCodes(c.data);
    if (h.data) setHistory(h.data);
    // 표가 없는 것과 이력이 없는 것을 갈라둔다. 한데 묶으면 마이그레이션을 안 돌린 것을
    // '아직 아무 일도 없었다'로 읽고 넘어가게 된다.
    setNoHistoryTable(!!h.error);
  }, []);

  // 목록은 서버에 물어봐야 알 수 있어 첫 렌더 뒤에 채운다
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /**
   * 상태를 바꾼다.
   *
   * users 를 직접 고치지 않고 decide_user 만 부른다 — 그래야 이력이 반드시 함께 남는다.
   * 사유가 있어야 하는 판단인지도 DB가 다시 본다. 화면에서만 막으면 언젠가 빠뜨린다.
   */
  const setStatus = async (id: string, status: AppUser["status"], why?: string) => {
    if (NEEDS_REASON.includes(status) && !why?.trim()) {
      // 지난번 오류를 그대로 두면, 방금 연 칸이 이미 실패한 것처럼 보인다
      setError(undefined);
      setAsking({ id, status });
      setReason("");
      return;
    }

    setBusy(true);
    setError(undefined);

    const { error } = await supabaseBrowser()!.rpc("decide_user", {
      p_user: id,
      p_status: status,
      p_reason: why?.trim() || null,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    setAsking(undefined);
    setReason("");
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

  /** 다 쓴 코드는 목록에서 아주 치운다. 살아 있는 코드는 폐기부터 해야 지울 수 있다. */
  const removeCode = async (id: string) => {
    setBusy(true);
    setError(undefined);
    const supabase = supabaseBrowser()!;
    const { error } = await supabase.from("invite_codes").delete().eq("id", id);
    if (error) setError(error.message);
    await load();
    setBusy(false);
  };

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  /**
   * 관리자를 임명하고 내리는 것은 최고 관리자만 한다.
   * 005 마이그레이션 전에는 최고 관리자라는 것이 없으므로(undefined) 예전처럼 둔다 —
   * 여기서 잠가버리면 아무도 관리자를 세울 수 없게 된다.
   */
  const canSetRole = users.find((u) => u.id === meId)?.is_owner !== false;

  const ask: AskCtl = {
    asking,
    reason,
    busy,
    setReason,
    cancel: () => {
      setAsking(undefined);
      setReason("");
    },
    confirm: () => {
      if (asking) void setStatus(asking.id, asking.status, reason);
    },
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 sm:p-5">
      {error && (
        <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "#fff5f5", color: "#c92a2a" }}>
          {error}
        </p>
      )}

      <div
        className="scroll-x flex items-center gap-1 border-b"
        style={{ borderColor: "var(--ui-border)" }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] transition-colors"
              style={{
                borderColor: active ? "var(--ui-accent)" : "transparent",
                color: active ? "var(--ui-accent)" : "var(--ui-muted)",
                fontWeight: active ? 700 : 500,
              }}
            >
              {t.label}
              {/* 기다리는 사람이 있으면 다른 탭에 있어도 보여야 한다 */}
              {t.key === "pending" && pending.length > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: "#ffe3e3", color: "#c92a2a" }}
                >
                  {pending.length}
                </span>
              )}
            </button>
          );
        })}

        {/*
          매뉴얼은 자주 열 것이 아니라 막힐 때 한 번 여는 것이다 — 탭 옆에 작게 둔다.
          관리자 문서는 주소를 알아도 서버가 역할을 확인하므로 편집자는 받을 수 없다.
          주보 만드는 방법은 사용자 문서에 있어, 관리자에게도 함께 필요하다.
        */}
        <div
          className="ml-auto flex shrink-0 items-center gap-1.5 pl-3 text-[11px]"
          style={{ color: "var(--ui-muted)" }}
        >
          <a href="/manual/the-piece-manual-user.pdf" download="THE_PIECE_주보_매뉴얼_사용자용.pdf">
            사용자 매뉴얼
          </a>
          <span aria-hidden>·</span>
          <a href="/api/manual/admin" style={{ color: "var(--ui-accent)", fontWeight: 700 }}>
            관리자 매뉴얼
          </a>
        </div>
      </div>

      {tab === "pending" && (
        <PendingTab users={pending} busy={busy} ask={ask} onStatus={setStatus} />
      )}
      {tab === "history" && <HistoryTab rows={history} missing={noHistoryTable} />}
      {tab === "codes" && (
        <CodesTab
          codes={codes}
          busy={busy}
          onIssue={issueCode}
          onRevoke={revoke}
          onRemove={removeCode}
        />
      )}
      {tab === "members" && (
        <MembersTab
          users={others}
          meId={meId}
          busy={busy}
          canSetRole={canSetRole}
          ask={ask}
          onRole={setRole}
          onStatus={setStatus}
        />
      )}
    </div>
  );
}

function PendingTab({
  users,
  busy,
  ask,
  onStatus,
}: {
  users: AppUser[];
  busy: boolean;
  ask: AskCtl;
  onStatus: (id: string, status: AppUser["status"]) => void;
}) {
  return (
    <Section title={`가입 신청 ${users.length}건`} desc="승인해야 주보를 만들 수 있습니다.">
      {users.length === 0 ? (
        <Hint>대기 중인 신청이 없습니다.</Hint>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <Row key={u.id}>
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
                onClick={() => onStatus(u.id, "approved")}
              >
                승인
              </Btn>
              <Btn size="sm" variant="danger" disabled={busy} onClick={() => onStatus(u.id, "rejected")}>
                거절
              </Btn>

              {ask.asking?.id === u.id && <ReasonBox ctl={ask} />}
            </Row>
          ))}
        </div>
      )}
    </Section>
  );
}

/**
 * 승인·거절·차단의 이력.
 *
 * 관리자라면 누구나 본다. 승인을 맡은 사람이 여럿인데 서로의 판단을 볼 수 없으면
 * 한쪽이 거절한 사람을 다른 쪽이 승인하는 일이 생긴다.
 *
 * 여기서는 아무것도 고칠 수 없다 — DB에도 쓰기 정책이 없다.
 */
function HistoryTab({ rows, missing }: { rows: UserDecision[]; missing: boolean }) {
  return (
    <Section
      title={`이력 ${rows.length}건`}
      desc="누가 언제 승인·거절·차단했는지, 역할을 바꿨는지 남습니다. 지우거나 고칠 수 없습니다."
    >
      {missing ? (
        <Hint>
          이력을 담을 표가 아직 없습니다. Supabase SQL Editor에서
          011_decision_log.sql 을 실행하면 이때부터 쌓입니다.
        </Hint>
      ) : rows.length === 0 ? (
        <Hint>아직 남은 이력이 없습니다.</Hint>
      ) : (
        <div className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const { text, danger } = decisionLabel(r);
            return (
              <Row key={r.id}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px]">
                    <span className="font-bold">{r.user_name || r.user_email || "(지워진 계정)"}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={
                        danger
                          ? { background: "#fff5f5", color: "#c92a2a" }
                          : { background: "#ebfbee", color: "#2b8a3e" }
                      }
                    >
                      {text}
                    </span>
                  </p>

                  {/* 사유는 이 표의 알맹이다. 줄여 접지 않고 그대로 보여준다. */}
                  {r.reason && (
                    <p className="mt-0.5 text-[12px]" style={{ color: "var(--ui-text)" }}>
                      {r.reason}
                    </p>
                  )}

                  <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--ui-muted)" }}>
                    {r.user_email}
                    {" · "}
                    {/*
                      '누가'가 비어 있는 줄은 화면 밖에서 바뀐 것이다 —
                      SQL 편집기나 서버 열쇠로 고치면 누른 사람이 없다.
                      초대코드로 스스로 승인된 줄은 본인 이름이 그대로 찍힌다.
                    */}
                    {r.actor_name || r.actor_email || "화면 밖에서 변경"}
                    {" · "}
                    {new Date(r.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
              </Row>
            );
          })}
        </div>
      )}

      <Hint>최근 200건까지 보여줍니다.</Hint>
    </Section>
  );
}

function CodesTab({
  codes,
  busy,
  onIssue,
  onRevoke,
  onRemove,
}: {
  codes: InviteCode[];
  busy: boolean;
  onIssue: () => void;
  onRevoke: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Section
      title="초대코드"
      desc={`발급 후 ${CODE_TTL_HOURS}시간, 최대 10명까지 쓸 수 있습니다. 단톡방에 공유하면 승인 없이 바로 시작합니다.`}
      right={
        <Btn size="sm" variant="primary" disabled={busy} onClick={onIssue}>
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
              <Row key={c.id} faded={dead}>
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
                  {dead ? (
                    // 이미 못 쓰는 코드다 — 목록에서 치워 살아 있는 코드가 눈에 띄게 한다
                    <Btn size="sm" variant="danger" disabled={busy} onClick={() => onRemove(c.id)}>
                      삭제
                    </Btn>
                  ) : (
                    <>
                      <Btn size="sm" onClick={() => void navigator.clipboard.writeText(c.code)}>
                        복사
                      </Btn>
                      <Btn size="sm" variant="danger" disabled={busy} onClick={() => onRevoke(c.id)}>
                        폐기
                      </Btn>
                    </>
                  )}
                </div>
              </Row>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function MembersTab({
  users,
  meId,
  busy,
  canSetRole,
  ask,
  onRole,
  onStatus,
}: {
  users: AppUser[];
  meId: string;
  busy: boolean;
  canSetRole: boolean;
  ask: AskCtl;
  onRole: (id: string, role: AppUser["role"]) => void;
  onStatus: (id: string, status: AppUser["status"]) => void;
}) {
  return (
    <Section
      title={`구성원 ${users.length}명`}
      desc={
        canSetRole
          ? "관리자로 올리면 가입 승인과 초대코드 발급을 맡길 수 있습니다. 차단하면 로그인해도 주보를 열거나 고칠 수 없습니다. 거절한 신청도 이 목록에 남아 있어 여기서 되돌릴 수 있습니다."
          : "차단하면 로그인해도 주보를 열거나 고칠 수 없습니다. 계정과 만들어둔 주보는 남습니다. 거절한 신청도 이 목록에서 되돌릴 수 있습니다."
      }
    >
      {!canSetRole && <Hint>역할(관리자·편집자)은 최고 관리자만 바꿀 수 있습니다.</Hint>}

      {users.length === 0 ? (
        <Hint>아직 이용 중인 구성원이 없습니다.</Hint>
      ) : (
        <div className="flex flex-col gap-1.5">
          {users.map((u) => (
            <Row key={u.id}>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-bold">
                  {u.name || "(이름 없음)"}
                  {u.id === meId && (
                    <span className="text-[11px]" style={{ color: "var(--ui-accent)" }}>
                      나
                    </span>
                  )}
                  {u.is_owner && <OwnerBadge />}
                  <StatusBadge status={u.status} />
                  <MailBadge at={u.email_confirmed_at} />
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--ui-muted)" }}>
                  {u.email} · {STATUS_LABEL[u.status]}
                </p>
              </div>

              <select
                value={u.role}
                disabled={busy || u.id === meId || !canSetRole || u.is_owner}
                title={!canSetRole ? "역할은 최고 관리자만 바꿀 수 있습니다" : undefined}
                onChange={(e) => onRole(u.id, e.target.value as AppUser["role"])}
                style={{ width: "auto" }}
              >
                <option value="editor">편집자</option>
                <option value="admin">관리자</option>
              </select>

              {/*
                자기 자신은 막지 못한다 — 마지막 관리자가 스스로를 잠그면 되살릴 사람이 없다.
                최고 관리자도 마찬가지다 — 관리자끼리 서로 내리는 일이 생기지 않게 한다.
              */}
              {u.id !== meId &&
                !u.is_owner &&
                (u.status === "blocked" ? (
                  <Btn size="sm" variant="primary" disabled={busy} onClick={() => onStatus(u.id, "approved")}>
                    차단 해제
                  </Btn>
                ) : (
                  <>
                    {/*
                      거절을 되돌리는 자리는 여기뿐이다. '다시 승인'은 무엇을 되돌리는지
                      말해주지 않아, 거절한 사람 앞에서 누르기를 망설이게 된다.
                    */}
                    {u.status !== "approved" && (
                      <Btn size="sm" variant="primary" disabled={busy} onClick={() => onStatus(u.id, "approved")}>
                        {u.status === "rejected" ? "거절 취소하고 승인" : "다시 승인"}
                      </Btn>
                    )}
                    <Btn
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      title="로그인해도 아무것도 할 수 없게 막습니다. 계정과 주보는 지워지지 않습니다."
                      onClick={() => onStatus(u.id, "blocked")}
                    >
                      로그인 차단
                    </Btn>
                  </>
                ))}

              {ask.asking?.id === u.id && <ReasonBox ctl={ask} />}
            </Row>
          ))}
        </div>
      )}
    </Section>
  );
}
