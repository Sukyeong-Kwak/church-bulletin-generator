import { redirect } from "next/navigation";
import { supabaseConfigured } from "./config";
import { currentSession } from "./server";
import type { AppUser } from "./types";

/**
 * 승인된 사용자만 통과시킨다.
 * 서버 연동이 꺼져 있으면(로컬 모드) 아무도 막지 않는다.
 */
export async function requireApproved(): Promise<AppUser | null> {
  if (!supabaseConfigured) return null;

  const { authed, profile } = await currentSession();

  // 로그인 화면으로 보내는 것은 '세션이 없을 때'뿐이다.
  // 로그인한 사람을 /login으로 보내면 proxy.ts가 그를 다시 이리로 되돌려 무한히 튕긴다.
  if (!authed) redirect("/login");

  /*
   * 로그인은 됐는데 public.users에 행이 없다.
   * 가입 트리거(handle_new_user)가 만들지 못한 계정이다 — 대시보드에서 직접 만든 계정이거나,
   * 트리거를 깔기 전에 가입한 계정이다. 여기서 멈춰 세워야 무한 튕김이 되지 않는다.
   */
  if (!profile) redirect("/pending");

  // 차단은 '아직 승인 안 됨'과 다르다 — 기다린다고 풀리지 않으므로 따로 알려준다
  if (profile.status === "blocked") redirect("/blocked");
  if (profile.status !== "approved") redirect("/pending");
  return profile;
}

/** 관리자 전용 화면 */
export async function requireAdmin(): Promise<AppUser | null> {
  const user = await requireApproved();
  if (user && user.role !== "admin") redirect("/");
  return user;
}
