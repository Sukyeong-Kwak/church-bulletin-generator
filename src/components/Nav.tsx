"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { formatServiceDate } from "@/lib/layout";
import { useDoc } from "@/lib/store";
import { isPublicPath } from "@/lib/supabase/config";
import { useAuth } from "@/lib/supabase/useAuth";
import { Btn } from "./ui";

const MAKE_PATHS = ["/", "/common", "/fixed", "/preview"];

/**
 * 1단계 메뉴.
 *   주보 만들기 — 이번 주 주보를 만드는 모든 과정
 *   보관함     — 지난 주보 목록
 */
const PRIMARY = [
  { href: "/", label: "주보 만들기", match: MAKE_PATHS },
  { href: "/library", label: "보관함", match: ["/library"] },
];

export function Nav() {
  const path = usePathname();
  const router = useRouter();
  const { doc, saveCurrent, dirty, loaded } = useDoc();
  const { user, enabled, signOut } = useAuth();
  const inMake = MAKE_PATHS.includes(path);

  // 로그인·가입 화면에서는 상단 메뉴를 숨긴다
  if (isPublicPath(path) || path === "/pending") return null;

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
    router.refresh();
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
        {PRIMARY.map((m) => {
          const active = m.match.includes(path);
          return (
            <Link
              key={m.href}
              href={m.href}
              className="whitespace-nowrap rounded-[9px] px-3 py-1.5 text-[13px] transition-colors sm:px-3.5"
              style={{
                background: active ? "#fff" : "transparent",
                color: active ? "var(--ui-text)" : "var(--ui-muted)",
                fontWeight: active ? 700 : 500,
                boxShadow: active ? "0 1px 2px rgba(16,24,40,.08)" : "none",
              }}
            >
              {m.label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {loaded && inMake && (
          <>
            <span className="hidden text-[12px] lg:inline" style={{ color: "var(--ui-muted)" }}>
              {formatServiceDate(doc.serviceDate)}
            </span>
            <Btn variant={dirty ? "primary" : "default"} size="sm" onClick={saveCurrent}>
              {dirty ? "저장" : "저장됨"}
            </Btn>
          </>
        )}

        {user?.role === "admin" && (
          <Link
            href="/admin"
            className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold"
            style={{
              background: path === "/admin" ? "var(--ui-accent-soft)" : "transparent",
              color: path === "/admin" ? "var(--ui-accent)" : "var(--ui-muted)",
            }}
          >
            관리자
          </Link>
        )}

        {enabled && user && (
          <button
            onClick={handleSignOut}
            className="text-[12px]"
            style={{ color: "var(--ui-muted)" }}
            title={user.email}
          >
            로그아웃
          </button>
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
    </div>
  );
}
