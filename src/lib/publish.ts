"use client";

import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * 교회 QR 주소(/now)에 지금 올라가 있는 주보.
 *
 * 저장은 아직 공개가 아니다. 여기에 올려야 QR을 찍은 사람에게 보인다.
 * 잠금은 화면이 아니라 DB 함수에 있다 — 올리지 않은 주보는 주소를 알아도 열리지 않는다.
 */
export interface PublishState {
  bulletinId: string | null;
  /** 올린 시각. 아무것도 안 올라가 있으면 null */
  publishedAt: string | null;
  /**
   * 주일이 아닌 날 관리자가 열어둔 끝 시각. null이면 주일에만 열린다.
   *
   * 올렸다고 늘 보이는 것이 아니다 — 입구 QR은 지나가는 누구나 찍을 수 있고
   * 찍은 사람은 그 주소를 그대로 퍼뜨릴 수 있어, 주중에는 닫아 둔다.
   */
  openUntil: string | null;
}

const NONE: PublishState = { bulletinId: null, publishedAt: null, openUntil: null };

/** 한국시간으로 오늘이 주일인가. QR이 저절로 열리는 날이다. */
export function isSundayInSeoul(): boolean {
  return (
    new Date().toLocaleDateString("en-US", { timeZone: "Asia/Seoul", weekday: "short" }) === "Sun"
  );
}

/**
 * 교회 QR이 가리키는 주소. 브라우저에서만 알 수 있다.
 * QR 한 장과 포스터가 같은 주소를 봐야 하므로 한 곳에서만 만든다.
 */
export function nowUrl(): string {
  return typeof window === "undefined" ? "" : `${window.location.origin}/now`;
}

/** 서버가 연결되어 있지 않으면 null — 로컬 모드에서는 공유 자체가 없다 */
export async function loadPublished(): Promise<PublishState | null> {
  const supabase = supabaseBrowser();
  if (!supabase) return null;

  const full = await supabase
    .from("published")
    .select("bulletin_id, published_at, open_until")
    .eq("id", 1)
    .maybeSingle();

  if (!full.error && full.data) {
    return {
      bulletinId: full.data.bulletin_id,
      publishedAt: full.data.published_at,
      openUntil: full.data.open_until,
    };
  }

  // 009 마이그레이션 전이면 open_until 칸이 아직 없어 위 물음이 통째로 실패한다.
  // 그 칸만 빼고 다시 물어본다 — 요일 제한이 없던 때이므로 '따로 열어둔 것 없음'으로 둔다.
  const { data, error } = await supabase
    .from("published")
    .select("bulletin_id, published_at")
    .eq("id", 1)
    .maybeSingle();

  // 007 마이그레이션 전이면 이 표가 없다. 그때는 '아무것도 안 올라감'으로 둔다.
  if (error || !data) return NONE;
  return { bulletinId: data.bulletin_id, publishedAt: data.published_at, openUntil: null };
}

/**
 * 007 마이그레이션을 아직 안 돌린 서버에서는 이 함수들이 없다.
 * 그때 나오는 영어 오류를 그대로 보여주면 무엇을 해야 하는지 알 수 없다.
 */
function readable(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("could not find the function") || m.includes("does not exist")) {
    return "서버 준비가 덜 됐습니다. Supabase에서 007_publish.sql 을 실행해주세요.";
  }
  return message;
}

/** 009 마이그레이션을 아직 안 돌린 서버에서는 여닫는 함수가 없다 */
function readableOpen(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("could not find the function") || m.includes("does not exist")) {
    return "서버 준비가 덜 됐습니다. Supabase에서 009_sunday_only.sql 을 실행해주세요.";
  }
  return message;
}

/** 이 주보를 QR 주소에 올린다. 올린 시각을 돌려준다. */
export async function publishBulletin(id: string): Promise<string> {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

  const { data, error } = await supabase.rpc("publish_bulletin", { p_id: id });
  if (error) throw new Error(readable(error.message));
  return data as string;
}

/**
 * 주일이 아닌 날, 오늘 하루만 연다. 닫히는 시각(한국시간 자정)을 돌려준다.
 * 관리자만 부를 수 있고, 잠금은 DB 함수에 있다.
 */
export async function openToday(): Promise<string> {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

  const { data, error } = await supabase.rpc("open_today");
  if (error) throw new Error(readableOpen(error.message));
  return data as string;
}

/** 오늘 따로 열어둔 것을 거둔다. 주보는 그대로 올라가 있다. */
export async function closeToday(): Promise<void> {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

  const { error } = await supabase.rpc("close_today");
  if (error) throw new Error(readableOpen(error.message));
}

/** QR 주소를 다시 닫는다. 주보 자체는 남는다. */
export async function unpublishBulletin(): Promise<void> {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

  const { error } = await supabase.rpc("unpublish_bulletin");
  if (error) throw new Error(readable(error.message));
}
