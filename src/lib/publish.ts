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
}

const NONE: PublishState = { bulletinId: null, publishedAt: null };

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

  const { data, error } = await supabase
    .from("published")
    .select("bulletin_id, published_at")
    .eq("id", 1)
    .maybeSingle();

  // 007 마이그레이션 전이면 이 표가 없다. 그때는 '아무것도 안 올라감'으로 둔다.
  if (error || !data) return NONE;
  return { bulletinId: data.bulletin_id, publishedAt: data.published_at };
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

/** 이 주보를 QR 주소에 올린다. 올린 시각을 돌려준다. */
export async function publishBulletin(id: string): Promise<string> {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

  const { data, error } = await supabase.rpc("publish_bulletin", { p_id: id });
  if (error) throw new Error(readable(error.message));
  return data as string;
}

/** QR 주소를 다시 닫는다. 주보 자체는 남는다. */
export async function unpublishBulletin(): Promise<void> {
  const supabase = supabaseBrowser();
  if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

  const { error } = await supabase.rpc("unpublish_bulletin");
  if (error) throw new Error(readable(error.message));
}
