"use client";

import { supabaseBrowser, type Client } from "@/lib/supabase/client";
import { docToRow, rowToDoc } from "./map";
import { newDocId, normalizeSettings, type Settings } from "@/lib/settings";
import { URL_TTL } from "./images";
import { STORAGE_LIMIT_BYTES } from "@/lib/retention";
import { webKeyFor } from "@/lib/webImage";
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
  /** 바이트. Storage가 안 알려주면 0으로 센다 — 모르는 것을 크게 부풀리지 않는다 */
  size: number;
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

    /*
     * 못 읽었으면 멈추지 말고 알린다.
     *
     * 예전에는 조용히 멈췄다. 정리(pruneImages)에서는 덜 지우고 마는 것이라 그럭저럭 넘어갔지만,
     * 용량을 세는 쪽에서는 '못 읽었다'가 '0바이트 쓰고 있다'로 둔갑한다. 저장 공간이 거의 찼는데
     * 화면이 텅 비었다고 말하는 셈이다. 반쯤 읽은 것으로 판단을 내리느니 못 읽었다고 하는 편이 낫다.
     */
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const entry of data) {
      // Supabase가 빈 폴더를 유지하려고 넣어두는 파일 — 우리 것이 아니다
      if (entry.name.startsWith(".")) continue;

      const path = folder ? `${folder}/${entry.name}` : entry.name;
      // 폴더는 id가 없다 — 한 겹 더 들어간다
      if (!entry.id) found.push(...(await listFiles(client, path, depth + 1)));
      else
        found.push({
          path,
          createdAt: entry.created_at,
          size: Number(entry.metadata?.size) || 0,
        });
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

    // 원본과 그 화면용 축소본은 한 벌이다. 함께 지운다.
    const paths = (data[0].image_paths ?? []).flatMap((p: string) => [p, webKeyFor(p)]);
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

  async putImageAt(key, blob) {
    const supabase = supabaseBrowser();
    if (!supabase) throw new Error("서버에 연결되어 있지 않습니다.");

    // upsert — 같은 주보를 다시 내보내면 축소본도 같은 자리에 새로 앉는다
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(key, blob, { contentType: blob.type || "application/octet-stream", upsert: true });

    if (error) throw new Error(error.message);
  },

  async imageUrls(keys, ttlSeconds = URL_TTL.view) {
    const supabase = supabaseBrowser();
    if (!supabase || keys.length === 0) return keys.map(() => null);

    /*
     * 여기서 예외가 새어 나가면 안 된다.
     *
     * 이 자리를 부르는 곳(QR 화면·보관함 목록·편집 화면 배경)은 모두 화면을 그리는 도중이라,
     * 던져버리면 주소가 영영 채워지지 않고 뼈대만 남은 화면에서 멈춘다. 연결이 잠깐 나간 것뿐인데
     * 새로고침 말고는 길이 없어진다. storage-js 는 제 오류만 값으로 돌려주고 그 밖의 것
     * (연결 끊김 같은 것)은 그대로 던지므로, 여기서 받아 '못 받았음'으로 바꿔 돌려준다.
     */
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(keys, ttlSeconds);

      /*
       * 못 받은 것과 없는 것은 다르다.
       * 세션이 끊겼거나 연결이 잠깐 나갔을 때 조용히 빈손으로 돌아오면, 보는 쪽에서는
       * '이 쪽을 불러오지 못했습니다'가 모든 장에 뜬다. 왜 그런지 알 길이 아무 데도 없다.
       */
      if (error) console.error("[storage] 이미지 주소를 받지 못했습니다:", error.message);

      // 없는 파일은 그 자리만 오류로 돌아온다. 받은 것을 경로로 되짚어야
      // 한 장이 빠졌을 때 뒤가 통째로 한 칸씩 당겨지지 않는다.
      const byPath = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.path && row.signedUrl && !row.error) byPath.set(row.path, row.signedUrl);
      }
      return keys.map((k) => byPath.get(k) ?? null);
    } catch (e) {
      console.error("[storage] 이미지 주소를 받지 못했습니다:", e);
      return keys.map(() => null);
    }
  },

  releaseUrls() {
    // 서명한 주소는 스스로 만료된다 — 여기서 거둘 것이 없다
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

  async storageUsage() {
    const supabase = supabaseBrowser();
    if (!supabase) return null;

    // 정리(pruneImages)와 같은 훑기다. 화면에서 부를 때만 도는 자리라 따로 두었다.
    // 도중에 못 읽으면 listFiles 가 던진다 — 반쯤 센 값을 내놓지 않으려는 것이다.
    try {
      const files = await listFiles(supabase, "");
      return {
        bytes: files.reduce((sum, f) => sum + f.size, 0),
        files: files.length,
        limitBytes: STORAGE_LIMIT_BYTES,
      };
    } catch {
      return null;
    }
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
