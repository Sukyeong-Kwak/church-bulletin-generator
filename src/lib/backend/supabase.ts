"use client";

import { supabaseBrowser, type Client } from "@/lib/supabase/client";
import { docToRow, rowToDoc } from "./map";
import { newDocId, normalizeSettings, type Settings } from "@/lib/settings";
import type { Backend } from "./types";

const BUCKET = "bulletin-images";

/**
 * 갓 올라온 파일은 지우지 않는다.
 *
 * 아직 저장하지 않은 주보는 그 사람 브라우저에만 있어서, 다른 사람 화면에서는
 * 그 배경이 '아무도 안 쓰는 그림'으로 보인다. 그걸 지우면 남의 작업물이 사라진다.
 *
 * 주보는 주 단위로 만든다 — 화요일에 배경을 올리고 토요일에 저장하는 일이
 * 얼마든지 있다. 그래서 한 주기를 넉넉히 넘겨 잡는다.
 * 늦게 지우면 용량을 조금 더 쓰지만, 잘못 지우면 되돌릴 방법이 없다.
 */
const GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Storage 목록·삭제 한 번에 다루는 개수 */
const PAGE = 100;

/** 폴더 안의 폴더까지 몇 겹이나 들어갈지. 지금은 한 겹뿐이지만 무한 재귀는 막아둔다. */
const MAX_DEPTH = 4;

interface StoredFile {
  path: string;
  /** 올린 시각. Storage가 안 알려줄 수도 있다 */
  createdAt: string | null | undefined;
}

/**
 * 버킷에 실제로 들어 있는 파일을 모두 훑는다.
 *
 * 폴더 이름을 코드에 적어두는 방법도 있지만, 그러면 새 종류의 이미지가 생겼을 때
 * 그 목록에 넣는 것을 잊는 순간 그 폴더만 조용히 정리되지 않고 쌓인다.
 * 그래서 어디에 무엇이 있는지 미리 알지 않고, 있는 그대로 내려가며 찾는다.
 */
async function listFiles(client: Client, folder: string, depth = 0): Promise<StoredFile[]> {
  if (depth > MAX_DEPTH) return [];

  const found: StoredFile[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage
      .from(BUCKET)
      .list(folder, { limit: PAGE, offset });
    if (error || !data?.length) break;

    for (const entry of data) {
      // Supabase가 빈 폴더를 유지하려고 넣어두는 파일 — 우리 것이 아니다
      if (entry.name.startsWith(".")) continue;

      const path = folder ? `${folder}/${entry.name}` : entry.name;
      // 폴더는 id가 없다 — 한 겹 더 들어간다
      if (!entry.id) found.push(...(await listFiles(client, path, depth + 1)));
      else found.push({ path, createdAt: entry.created_at });
    }

    if (data.length < PAGE) break;
  }

  return found;
}

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

    const { data, error } = await supabase
      .from("bulletins")
      .select("*")
      .order("service_date", { ascending: false });

    // 못 받아온 것과 한 부도 없는 것은 다르다.
    // 빈 목록으로 뭉개면 '아무도 안 쓰는 이미지'를 세는 쪽이 전부 버려진 줄 안다.
    if (error) throw new Error(error.message);
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

    // 행을 먼저 지운다. 이미지부터 지우면 삭제 권한이 없을 때
    // 주보는 남고 이미지만 사라진 반쪽짜리가 된다.
    // RLS가 막으면 오류 없이 0건이 지워지므로, 지워진 행을 받아 확인한다.
    const { data, error } = await supabase
      .from("bulletins")
      .delete()
      .eq("id", id)
      .select("image_paths");

    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("주보는 관리자만 삭제할 수 있습니다.");

    const paths = data[0].image_paths ?? [];
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  },

  async setBulletinImages(id, keys) {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    const { error } = await supabase.from("bulletins").update({ image_paths: keys }).eq("id", id);
    if (error) throw new Error(error.message);
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

  async pruneImages(keep) {
    const supabase = supabaseBrowser();
    if (!supabase) return 0;

    const now = Date.now();
    const stale = (await listFiles(supabase, ""))
      .filter((f) => !keep.has(f.path))
      // 올린 시각을 모르면 오래된 것으로 본다 — 남겨두면 영영 안 지워진다
      .filter((f) => !(now - Date.parse(f.createdAt ?? "") < GRACE_MS))
      .map((f) => f.path);

    for (let i = 0; i < stale.length; i += PAGE) {
      await supabase.storage.from(BUCKET).remove(stale.slice(i, i + PAGE));
    }
    return stale.length;
  },
};
