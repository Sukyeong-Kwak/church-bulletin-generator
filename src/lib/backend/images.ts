"use client";

import { makeWebCopy, webKeyFor } from "@/lib/webImage";
import type { Backend } from "./types";

/**
 * 서명한 주소가 살아 있는 시간.
 *
 * 이 통은 비공개라 주소만으로는 열리지 않는다. 볼 수 있는 사람인지 확인한 뒤
 * 한시적으로 여는 표를 끊어주고, 브라우저가 그 표로 직접 받아 캐시에 담는다.
 *
 * 두 가지로 나눈다.
 *
 *   view  QR로 들어온 사람에게. 한 시간. 주보를 내려도 이미 끊긴 표는 그때까지 살아 있으니
 *         짧게 끊는다 — 예배 한 번을 보기에 넉넉하면서 다음 주까지 남지는 않는 길이다.
 *   edit  주보를 만드는 사람에게. 반나절. 이 사람들은 원래 통 안을 전부 볼 수 있어
 *         표를 길게 끊는다고 더 열리는 것이 없다. 짧게 끊으면 한 시간 넘게 붙잡고 고치는 동안
 *         화면의 배경이 소리 없이 사라진다.
 */
export const URL_TTL = { view: 60 * 60, edit: 12 * 60 * 60 } as const;

/**
 * 이미지 한 벌 = 원본 + 화면용 축소본.
 *
 * 원본만 두면 폰으로 보는 사람이 인쇄 화질을 통째로 내려받게 되고,
 * 축소본만 두면 인쇄와 저장에서 화질을 잃는다. 그래서 둘 다 둔다.
 * 어느 원본의 축소본인지는 키 규칙(webKeyFor)으로 정해져 있어 표에 적을 것이 없다.
 */

/** 원본을 올리고, 그 옆에 화면용 축소본을 함께 둔다. 원본 키를 돌려준다. */
export async function putWithWebCopy(
  backend: Backend,
  blob: Blob,
  prefix: string,
): Promise<string> {
  const key = await backend.putImage(blob, prefix);
  await attachWebCopy(backend, key, blob);
  return key;
}

/**
 * 이미 올라간 원본에 축소본을 붙인다.
 *
 * 실패해도 넘어간다 — 축소본은 빨리 보여주려고 두는 것이지 없으면 안 되는 것이 아니다.
 * 보는 쪽은 축소본이 없으면 원본으로 되돌아간다(imagePairUrls).
 */
export async function attachWebCopy(backend: Backend, key: string, blob: Blob): Promise<void> {
  try {
    const small = await makeWebCopy(blob);
    if (small) await backend.putImageAt(webKeyFor(key), small);
  } catch {
    // 원본은 이미 자리를 잡았다. 축소본이 없다고 내보내기를 되돌리지 않는다.
  }
}

/**
 * 화면에 걸 주소를 키 순서 그대로 돌려준다. 축소본이 있으면 그것을, 없으면 원본을.
 *
 * 축소본을 만들기 전에 내보낸 옛 주보가 있고, 앞으로도 축소가 안 되는 그림
 * (이미 작은 것·브라우저가 못 읽는 형식)이 있다. 그때 빈 자리를 보여주는 대신 원본을 준다.
 *
 * 축소본부터 물어보고, 없는 것만 다시 묻는다. 두 벌을 늘 함께 받아오면 어차피 버릴 원본까지
 * 매번 꺼내게 된다 — 로컬 저장소에서는 그것이 파일을 통째로 읽는 일이다.
 */
export async function imagePairUrls(
  backend: Backend,
  keys: string[],
  ttlSeconds: number = URL_TTL.view,
): Promise<(string | null)[]> {
  if (keys.length === 0) return [];

  const urls = await backend.imageUrls(keys.map(webKeyFor), ttlSeconds);

  // 같은 키가 두 번 나올 수 있다(표지와 배경이 같은 그림일 때). 한 번만 묻는다.
  const missing = [...new Set(keys.filter((_, i) => !urls[i]))];
  if (missing.length === 0) return urls;

  const fallback = await backend.imageUrls(missing, ttlSeconds);
  const byKey = new Map(missing.map((k, i) => [k, fallback[i]]));

  return keys.map((k, i) => urls[i] ?? byKey.get(k) ?? null);
}
