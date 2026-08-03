"use client";

import { supabaseBrowser } from "@/lib/supabase/client";
import { docToRow, rowToDoc } from "./map";
import { newDocId, normalizeSettings, type Settings } from "@/lib/settings";
import type { Backend } from "./types";

const BUCKET = "bulletin-images";

function extOf(blob: Blob): string {
  const sub = blob.type.split("/")[1];
  if (!sub) return "bin";
  return sub === "jpeg" ? "jpg" : sub.replace(/\+.*$/, "");
}

/** 로그인한 사용자가 함께 쓰는 저장소. 데이터는 Postgres, 이미지는 Storage. */
export const supabaseBackend: Backend = {
  kind: "supabase",

  async loadSettings() {
    const supabase = supabaseBrowser();
    if (!supabase) return null;

    const { data } = await supabase.from("settings").select("data").eq("id", 1).single();
    return normalizeSettings((data?.data as Partial<Settings>) ?? null);
  },

  async saveSettings(settings) {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase
      .from("settings")
      .update({ data: settings, updated_by: user?.id ?? null })
      .eq("id", 1);
  },

  async listBulletins() {
    const supabase = supabaseBrowser();
    if (!supabase) return [];

    const { data } = await supabase
      .from("bulletins")
      .select("*")
      .order("service_date", { ascending: false });

    return (data ?? []).map(rowToDoc);
  },

  async saveBulletin(doc) {
    const supabase = supabaseBrowser();
    if (!supabase) return doc;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // id가 uuid가 아니면(로컬에서 만들어진 문서) 새로 발급한다
    const id = /^[0-9a-f-]{36}$/i.test(doc.id) ? doc.id : newDocId();

    const { data, error } = await supabase
      .from("bulletins")
      .upsert({ ...docToRow({ ...doc, id }), created_by: user?.id ?? null })
      .select()
      .single();

    if (error || !data) throw new Error(error?.message ?? "주보를 저장하지 못했습니다.");
    return rowToDoc(data);
  },

  async deleteBulletin(id) {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const { data } = await supabase.from("bulletins").select("image_paths").eq("id", id).single();
    if (data?.image_paths?.length) {
      await supabase.storage.from(BUCKET).remove(data.image_paths);
    }
    await supabase.from("bulletins").delete().eq("id", id);
  },

  async putImage(blob, prefix) {
    const supabase = supabaseBrowser();
    if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

    const path = `${prefix}/${newDocId()}.${extOf(blob)}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type || "application/octet-stream" });

    if (error) throw new Error(error.message);
    return path;
  },

  async getImage(key) {
    const supabase = supabaseBrowser();
    if (!supabase) return undefined;

    const { data } = await supabase.storage.from(BUCKET).download(key);
    return data ?? undefined;
  },

  async removeImages(keys) {
    const supabase = supabaseBrowser();
    if (!supabase || keys.length === 0) return;

    // 지우지 못해도 그냥 둔다. 새 이미지는 이미 올라갔고, 남은 파일은 용량만 차지한다.
    await supabase.storage.from(BUCKET).remove(keys);
  },
};
