"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatServiceDate } from "@/lib/layout";
import { useDoc } from "@/lib/store";
import { isPublicPath } from "@/lib/supabase/config";
import { useAuth } from "@/lib/supabase/useAuth";
import { Btn } from "./ui";

const MAKE_PATHS = ["/", "/common", "/fixed", "/preview"];

interface Tab {
  href: string;
  label: string;
  match: string[];
  /** 관리자에게만 보이고, 다른 메뉴와 구분되게 색을 준다 */
  adminOnly?: boolean;
}

/**
 * 1단계 메뉴.
 *   주보 만들기 — 이번 주 주보를 만드는 모든 과정
 *   보관함     — 지난 주보 목록
 *   관리자     — 가입 승인·초대코드 (관리자에게만 보인다)
 */
const PRIMARY: Tab[] = [
  { href: "/", label: "주보 만들기", match: MAKE_PATHS },
  { href: "/library", label: "보관함", match: ["/library"] },
];

const ADMIN_TAB: Tab = { href: "/admin", label: "관리자", match: ["/admin"], adminOnly: true };

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { saveCurrent, revertToSaved, canRevert, dirty, loaded } = useDoc();
  const { user, enabled, signOut } = useAuth();
  const inMake = MAKE_PATHS.includes(path);
  const tabs = user?.role === "admin" ? [...PRIMARY, ADMIN_TAB] : PRIMARY;

  // 로그인·가입 화면에서는 상단 메뉴를 숨긴다
  if (isPublicPath(path) || path === "/pending") return null;

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  // 되돌리면 저장 뒤에 한 일이 전부 사라진다 — 한 번 더 묻는다
  const handleRevert = () => {
    if (confirm("저장한 뒤에 고친 내용을 모두 버리고 마지막으로 저장한 상태로 돌아갑니다.")) {
      revertToSaved();
    }
  };

  return (
    <header
      className="flex h-[52px] shrink-0 items-center gap-2 border-b bg-white px-3 sm:gap-3 sm:px-4"
      style={{ borderColor: "var(--ui-border)" }}
    >
      <Link href="/" className="flex shrink-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/the-piece.svg" alt="" width={22} height={22} />
        <span className="hidden text-[14px] font-bold tracking-tight sm:inline">
          THE PIECE <span style={{ color: "var(--ui-muted)" }}>주보</span>
        </span>
      </Link>

      <nav
        className="flex shrink-0 gap-0.5 rounded-xl p-0.5 sm:ml-2"
        style={{ background: "#f1f2f5" }}
      >
        {tabs.map((m) => {
          const active = m.match.includes(path);
          // 관리자 메뉴는 자주 쓰지 않아 회색으로 두면 있는 줄도 모른다 — 색을 살려 눈에 띄게 한다
          const accent = m.adminOnly && !active;
          return (
            <Link
              key={m.href}
              href={m.href}
              className="whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[13px] transition-colors sm:px-3.5"
              style={{
                background: active ? "#fff" : accent ? "var(--ui-accent-soft)" : "transparent",
                color: active ? "var(--ui-text)" : accent ? "var(--ui-accent)" : "var(--ui-muted)",
                fontWeight: active || accent ? 700 : 500,
                boxShadow: active ? "0 1px 2px rgba(16,24,40,.08)" : "none",
              }}
            >
              {m.label}
            </Link>
          );
        })}
      </nav>

      {/* 오른쪽 묶음이 줄어들 수 있어야 폰에서 메뉴를 화면 밖으로 밀어내지 않는다 */}
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {loaded && inMake && (
          <>
            {canRevert && (
              <Btn size="sm" onClick={handleRevert} title="마지막으로 저장한 상태로 되돌립니다">
                초기화
              </Btn>
            )}
            <Btn variant={dirty ? "primary" : "default"} size="sm" onClick={saveCurrent}>
              {dirty ? "저장" : "저장됨"}
            </Btn>
          </>
        )}

        {enabled && user && (
          <>
            {/*
              누구로 들어와 있는지 — 여럿이 같은 컴퓨터를 쓰는 자리라 이름이 보여야 한다.
              눌러서 내 계정(비밀번호 바꾸기)으로 간다. 자기 이름은 자기 설정을 찾는 자리다.

              다만 폰에서는 이름까지 놓을 자리가 없다. 이메일이 길면 메뉴가 화면 밖으로
              밀려나므로, 좁은 화면에서는 '계정' 두 글자로 접는다 —
              통째로 감추면 폰에서는 비밀번호를 바꾸러 갈 길 자체가 없어진다.
            */}
            <Link
              href="/account"
              className="shrink-0 truncate text-[12px] font-semibold sm:max-w-[140px]"
              title={`${user.email} · 비밀번호 바꾸기`}
            >
              <span className="hidden sm:inline">{user.name || user.email}</span>
              <span className="sm:hidden">계정</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="shrink-0 text-[12px]"
              style={{ color: "var(--ui-muted)" }}
            >
              로그아웃
            </button>
          </>
        )}
      </div>
    </header>
  );
}

/**
 * 2단계 메뉴 — 주보 한 부를 만드는 순서 그대로.
 * 전체 공통 → 고정 페이지 → 본문 → 완성본 확인
 */
const MAKE_TABS = [
  { href: "/common", label: "전체 공통", hint: "모든 페이지에 들어가는 것 — 날짜·배경·교회 정보" },
  { href: "/fixed", label: "고정 페이지", hint: "표지 · 청년부 일정" },
  { href: "/", label: "본문 작성", hint: "광고 · 주요일정 · 설교" },
  { href: "/preview", label: "전체 보기", hint: "완성본 확인 · 이미지 내보내기" },
];

export function MakeTabs() {
  const path = usePathname();
  const { doc, loaded } = useDoc();

  return (
    <div
      className="scroll-x flex shrink-0 items-center gap-1 border-b bg-white px-2 sm:px-4"
      style={{ borderColor: "var(--ui-border)" }}
    >
      {MAKE_TABS.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            title={t.hint}
            className="whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px] transition-colors"
            style={{
              borderColor: active ? "var(--ui-accent)" : "transparent",
              color: active ? "var(--ui-accent)" : "var(--ui-muted)",
              fontWeight: active ? 700 : 500,
            }}
          >
            {t.label}
          </Link>
        );
      })}

      {/*
        지금 몇 주차 주보를 고치는 중인지.
        보관함에서 지난 주보를 열면 이 표시 말고는 알 길이 없어, 고치는 화면들 옆에 붙여 둔다.
      */}
      {loaded && (
        <span
          className="ml-auto whitespace-nowrap pl-3 text-[12px] font-semibold"
          style={{ color: "var(--ui-muted)" }}
        >
          {formatServiceDate(doc.serviceDate)}
        </span>
      )}
    </div>
  );
}
