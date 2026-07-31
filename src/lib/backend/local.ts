"use client";

import { deleteImage, getImage, putImage } from "@/lib/imageStore";
import { newId, normalizeFixed, normalizeSettings, type Settings } from "@/lib/settings";
import type { BulletinDoc } from "@/lib/types";
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
      library: (p.library ?? []).map((b) => ({ ...b, fixed: normalizeFixed(b.fixed) })),
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
    found?.imageKeys?.forEach((k) => void deleteImage(k));
    write({ ...cur, library: cur.library.filter((b) => b.id !== id) });
  },

  async putImage(blob, prefix) {
    const key = `${prefix}-${newId("i")}`;
    await putImage(key, blob);
    return key;
  },

  async getImage(key) {
    return getImage(key);
  },
};
