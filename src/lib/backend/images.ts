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

/** 동시에 열어둘 올리기 줄 수 */
const UPLOAD_LANES = 3;

/**
 * 여러 장을 한꺼번에 올린다. 원본 키를 넣은 순서 그대로 돌려준다.
 *
 * 한 장씩 차례로 올리던 자리다. 내보내기 한 번에 여덟 장, 3배 화질이면 장당 5~15MB 라,
 * 교회 인터넷에서는 그 줄서기가 '저장하는 중'의 대부분이었다 — 한 장을 다 올릴 때까지
 * 다음 장은 아무것도 하지 않고 기다린다.
 *
 * 몇 장을 동시에 올리되 한꺼번에 다 풀지는 않는다. 여덟 줄을 한 번에 열면 서로 대역폭을
 * 나눠 가져 전체는 빨라지지 않으면서 느린 회선에서는 죄다 시간 초과로 넘어간다.
 * 셋이면 왕복 대기는 거의 사라지고 한 줄에 돌아가는 몫도 남는다.
 *
 * 겹치는 것은 올리기뿐이다. 그림을 줄이는 일은 아래 oneAtATime 이 한 줄로 세운다 —
 * 큰 그림 셋을 한꺼번에 펼치면 태블릿의 기억 자리가 모자란다.
 *
 * 한 장이라도 실패하면 통째로 실패한다 — 차례로 올리던 때와 같다. 그 사이 이미 올라간
 * 것은 아무도 가리키지 않는 파일로 남는데, 저장·삭제 뒤에 도는 정리(prune)가 거둬 간다.
 */
export async function putAllWithWebCopy(
  backend: Backend,
  blobs: Blob[],
  prefix: string,
): Promise<string[]> {
  const keys: string[] = new Array(blobs.length);
  let next = 0;

  // 줄마다 '다음 것'을 집어 간다 — 장마다 크기가 달라도 빈 줄이 생기지 않는다
  const lane = async () => {
    for (;;) {
      const i = next++;
      if (i >= blobs.length) return;
      keys[i] = await putWithWebCopy(backend, blobs[i], prefix);
    }
  };

  await Promise.all(Array.from({ length: Math.min(UPLOAD_LANES, blobs.length) }, lane));
  return keys;
}

/**
 * 그림을 줄이는 일만은 한 번에 하나씩 지나간다.
 *
 * 올리기는 여러 줄로 나눠도 좋다 — 그동안 하는 일이 기다리는 것뿐이라 겹쳐도 값이 들지 않는다.
 * 그런데 축소본을 만드는 일은 다르다. 3배 화질 한 장(2673×3780)을 펼치면 그림 하나가
 * 40MB 남짓을 차지하고, 절반씩 접어 내려가는 동안 캔버스가 몇 장 더 붙는다.
 * 줄 셋이 동시에 펼치면 그만큼 세 배가 되어, 태블릿에서는 그 자리에서 탭이 죽는다.
 *
 * 그래서 올리기는 겹치게 두고 이 일만 줄을 세운다. 어차피 CPU 한 몫을 쓰는 일이라
 * 겹쳐 봐야 빨라지지도 않는다.
 */
let shrinking: Promise<unknown> = Promise.resolve();

function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  // 앞의 것이 실패했더라도 줄은 계속 나아간다
  const mine = shrinking.then(work, work);
  shrinking = mine.catch(() => undefined);
  return mine;
}

/**
 * 이미 올라간 원본에 축소본을 붙인다.
 *
 * 실패해도 넘어간다 — 축소본은 빨리 보여주려고 두는 것이지 없으면 안 되는 것이 아니다.
 * 보는 쪽은 축소본이 없으면 원본으로 되돌아간다(imagePairUrls).
 */
export async function attachWebCopy(backend: Backend, key: string, blob: Blob): Promise<void> {
  try {
    const small = await oneAtATime(() => makeWebCopy(blob));
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
