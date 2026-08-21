"use client";

import { deleteImage, getImage, listImageKeys, putImage } from "@/lib/imageStore";
import {
  newId,
  normalizeFixed,
  normalizeSettings,
  normalizeTheme,
  type Settings,
} from "@/lib/settings";
import type { BulletinDoc } from "@/lib/types";
import { webKeyFor } from "@/lib/webImage";
import type { Backend } from "./types";

const KEY = "bulletin-app-v1";

interface Stored {
  settings: Settings;
  library: BulletinDoc[];
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { settings: normalizeSettings(null), library: [] };
    const p = JSON.parse(raw) as Partial<Stored>;
    return {
      settings: normalizeSettings(p.settings),
      library: (p.library ?? []).map((b) => ({
        ...b,
        fixed: normalizeFixed(b.fixed),
        theme: normalizeTheme(b.theme),
      })),
    };
  } catch {
    return { settings: normalizeSettings(null), library: [] };
  }
}

function write(next: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장 실패가 편집을 막지 않도록 넘어간다
  }
}

/**
 * 로그인 없이 이 브라우저에만 저장하는 방식.
 * 문서는 localStorage, 이미지 원본은 IndexedDB에 둔다.
 */
export const localBackend: Backend = {
  kind: "local",

  async loadSettings() {
    return read().settings;
  },

  async saveSettings(settings) {
    write({ ...read(), settings });
  },

  async listBulletins() {
    return read().library.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  },

  async saveBulletin(doc) {
    const saved = { ...doc, updatedAt: new Date().toISOString() };
    const cur = read();
    write({
      ...cur,
      library: [saved, ...cur.library.filter((b) => b.id !== saved.id)].sort((a, b) =>
        b.serviceDate.localeCompare(a.serviceDate),
      ),
    });
    return saved;
  },

  async deleteBulletin(id) {
    const cur = read();
    const found = cur.library.find((b) => b.id === id);
    found?.imageKeys?.forEach((k) => {
      void deleteImage(k);
      void deleteImage(webKeyFor(k));
    });
    write({ ...cur, library: cur.library.filter((b) => b.id !== id) });
  },

  async setBulletinImages(id, keys) {
    const cur = read();
    write({
      ...cur,
      library: cur.library.map((b) => (b.id === id ? { ...b, imageKeys: keys } : b)),
    });
  },

  async putImage(blob, prefix) {
    const key = `${prefix}-${newId("i")}`;
    await putImage(key, blob);
    return key;
  },

  async putImageAt(key, blob) {
    await putImage(key, blob);
  },

  async getImage(key) {
    return getImage(key);
  },

  // 만료가 없다 — 이 브라우저 안에 만든 주소라 표를 끊을 상대가 없다
  async imageUrls(keys) {
    // 이 브라우저 안에 있는 파일이라 받아오는 데 드는 시간이 없다.
    // 여러 장을 한꺼번에 꺼내 곧바로 주소로 만든다.
    return Promise.all(
      keys.map(async (k) => {
        const blob = await getImage(k).catch(() => undefined);
        return blob ? URL.createObjectURL(blob) : null;
      }),
    );
  },

  releaseUrls(urls) {
    for (const u of urls) if (u) URL.revokeObjectURL(u);
  },

  async removeImages(keys) {
    for (const k of keys) await deleteImage(k).catch(() => {});
  },

  async storageUsage() {
    /*
     * 브라우저가 이 사이트에 내준 자리를 물어본다.
     *
     * 여기 담긴 것은 주보 이미지만이 아니라 작성 중인 내용까지 함께다. 한도도 서버처럼
     * 정해진 값이 아니라 기기 남은 용량에 따라 브라우저가 정한다 — 물어봐야 알 수 있다.
     */
    const asked = navigator.storage?.estimate?.();
    const estimate = asked ? await asked.catch(() => undefined) : undefined;
    if (!estimate) return null;

    return {
      bytes: estimate.usage ?? 0,
      // 파일 수는 이미지만 센다. 나머지는 파일이라 부를 만한 모양이 아니다.
      files: (await listImageKeys().catch(() => [])).length,
      limitBytes: estimate.quota ?? null,
    };
  },

  async pruneImages(keep) {
    // 이 브라우저 혼자 쓰는 저장소라, 남이 올리는 중인 파일을 지울 걱정이 없다
    const stale = (await listImageKeys()).filter((k) => !keep.has(k));
    for (const k of stale) await deleteImage(k).catch(() => {});
    return stale.length;
  },
};
