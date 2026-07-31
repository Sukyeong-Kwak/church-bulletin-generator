import { redirect } from "next/navigation";
import { supabaseConfigured } from "./config";
import { currentUser } from "./server";
import type { AppUser } from "./types";

/**
 * 승인된 사용자만 통과시킨다.
 * 서버 연동이 꺼져 있으면(로컬 모드) 아무도 막지 않는다.
 */
export async function requireApproved(): Promise<AppUser | null> {
  if (!supabaseConfigured) return null;

  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.status !== "approved") redirect("/pending");
  return user;
}

/** 관리자 전용 화면 */
export async function requireAdmin(): Promise<AppUser | null> {
  const user = await requireApproved();
  if (user && user.role !== "admin") redirect("/");
  return user;
}
