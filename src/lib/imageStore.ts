"use client";

/**
 * 배경·로고 이미지 저장소.
 * 고화질 원본을 그대로 보관해야 하므로 용량 제한이 작은 localStorage 대신 IndexedDB를 쓴다.
 * 문서에는 키만 저장하고, 화면에서는 blob URL로 불러온다.
 * (2단계에서 Supabase Storage로 교체)
 */

const DB_NAME = "bulletin";
const STORE = "images";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putImage(key: string, blob: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getImage(key: string): Promise<Blob | undefined> {
  const db = await open();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob;
}

/** 보관 중인 이미지 키 전부. 아무도 쓰지 않는 것을 골라내는 데 쓴다. */
export async function listImageKeys(): Promise<string[]> {
  const db = await open();
  const keys = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result.map(String));
    req.onerror = () => reject(req.error);
  });
  db.close();
  return keys;
}

export async function deleteImage(key: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** 원본 화질을 그대로 유지한 채 저장하고 키를 돌려준다 */
export async function storeFile(file: File, prefix: string): Promise<string> {
  const key = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await putImage(key, file);
  return key;
}

export interface ImageInfo {
  width: number;
  height: number;
}

export function readImageSize(url: string): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}
