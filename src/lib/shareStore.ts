/**
 * 폰으로 보여줄 주보 이미지를 서버에 둔다. 서버에서만 쓴다.
 *
 * 내보낸 이미지는 만든 사람의 브라우저(IndexedDB)에만 있어서, QR을 찍은 폰은
 * 가져올 곳이 없다. 그래서 QR을 만들 때 이미지를 이 폴더로 한 번 올려두고
 * 폰은 여기서 받아 간다.
 *
 * 보관 위치는 프로젝트 안의 .shares 폴더이며 git에 올라가지 않는다.
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";

/**
 * 보관 폴더. 빌드 도구가 "프로젝트 전체를 딸려 넣어야 하나" 헷갈리지 않도록
 * 경로를 프로젝트 밑의 고정된 한 폴더로만 짓는다.
 */
const ROOT = path.join(process.cwd(), ".shares");

/** 한 번에 올릴 수 있는 양 — 주보는 보통 5~10장이다 */
export const MAX_PAGES = 40;
export const MAX_BYTES = 25 * 1024 * 1024;

/** 폴더 이름이 될 값이라 경로를 벗어나는 글자는 받지 않는다 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface ShareMeta {
  serviceDate: string;
  /** 'jpg' | 'png' */
  ext: string;
  count: number;
  updatedAt: string;
}

export function validId(id: string): boolean {
  return ID.test(id);
}

function dirOf(id: string): string {
  return path.join(ROOT, id);
}

/** 이미지 묶음을 통째로 갈아 끼운다. 다시 내보내면 QR 주소는 그대로 둔 채 내용만 바뀐다. */
export async function saveShare(
  id: string,
  meta: Omit<ShareMeta, "count" | "updatedAt">,
  pages: Uint8Array[],
): Promise<ShareMeta> {
  const dir = dirOf(id);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  await Promise.all(
    pages.map((bytes, i) => writeFile(path.join(dir, `${i + 1}.${meta.ext}`), bytes)),
  );

  const full: ShareMeta = {
    ...meta,
    count: pages.length,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(dir, "meta.json"), JSON.stringify(full), "utf8");
  return full;
}

export async function readMeta(id: string): Promise<ShareMeta | null> {
  try {
    const raw = await readFile(path.join(dirOf(id), "meta.json"), "utf8");
    return JSON.parse(raw) as ShareMeta;
  } catch {
    return null;
  }
}

/** n은 1부터. 없으면 null. */
export async function readPage(id: string, n: number): Promise<{ bytes: Buffer; ext: string } | null> {
  const meta = await readMeta(id);
  if (!meta || n < 1 || n > meta.count) return null;
  try {
    const bytes = await readFile(path.join(dirOf(id), `${n}.${meta.ext}`));
    return { bytes, ext: meta.ext };
  } catch {
    return null;
  }
}

export async function removeShare(id: string): Promise<void> {
  await rm(dirOf(id), { recursive: true, force: true });
}

export async function listShareIds(): Promise<string[]> {
  try {
    const entries = await readdir(ROOT, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * 같은 와이파이의 폰이 접속할 수 있는 주소들.
 * 만든 사람이 localhost로 열어두면 QR에 localhost가 박혀 폰에서 열리지 않으므로,
 * 서버가 자기 랜 주소를 알려준다.
 */
export function lanOrigins(port: string, protocol = "http"): string[] {
  const found: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      found.push(`${protocol}://${net.address}:${port}`);
    }
  }
  return found;
}
