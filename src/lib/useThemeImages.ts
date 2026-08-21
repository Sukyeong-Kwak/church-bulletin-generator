"use client";

import { useEffect, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { imagePairUrls, URL_TTL } from "@/lib/backend/images";
import type { Theme } from "@/lib/types";

export interface ThemeUrls {
  background?: string;
  cover?: string;
  logo?: string;
}

/** urls의 세 자리와 테마의 세 키가 같은 순서로 마주 보게 둔다 */
const SLOTS = ["background", "cover", "logo"] as const;

/**
 * 배경·표지·로고를 화면에 걸 주소로 바꿔 준다.
 *
 * 세 장을 한 번에 물어보고, 실제 내려받기는 브라우저에 맡긴다. 한 장씩 차례로 받아
 * blob 주소를 만들던 때에는 화면을 옮길 때마다 같은 배경을 처음부터 다시 받았다.
 *
 * 여기서 오는 것은 화면용 축소본이다. 내보내기는 원본이 필요하므로 그때만 따로 받는다.
 */
export function useThemeImages(
  theme: Theme,
  enabled = true,
  ttlSeconds: number = URL_TTL.view,
): ThemeUrls {
  const [urls, setUrls] = useState<ThemeUrls>({});

  /**
   * 지금 화면이 쓰고 있는 주소 한 벌.
   *
   * 거두는 시점이 중요하다. 배경을 갈아 끼우면 이 훅이 새로 도는데, 그때 옛 주소를 먼저 거두면
   * 새 그림이 도착하기 전까지 미리보기의 모든 장에서 배경이 사라진다. 그래서 새것이 자리를
   * 잡은 뒤에 옛것을 거둔다. (Supabase 쪽은 거둘 것이 없어 이 차이가 드러나지 않는다.
   * 브라우저에만 저장하는 쪽에서만 눈에 보이던 자리라 놓치기 쉽다.)
   */
  const held = useRef<(string | null)[]>([]);

  // 세 키가 그대로면 다시 받지 않는다
  const signature = `${theme.backgroundUrl ?? ""}|${theme.coverUrl ?? ""}|${theme.logoUrl ?? ""}`;

  useEffect(() => {
    if (!enabled) return;

    let alive = true;
    const backend = getBackend();

    (async () => {
      const keys = signature.split("|");
      const present = keys.filter(Boolean);
      const got = await imagePairUrls(backend, present, ttlSeconds);

      if (!alive) {
        backend.releaseUrls(got);
        return;
      }

      // 빈 자리를 건너뛰고 물어봤으니, 받은 것을 원래 자리로 되돌려 놓는다
      const byKey = new Map(present.map((k, i) => [k, got[i]]));
      const next: ThemeUrls = {};
      SLOTS.forEach((slot, i) => {
        const url = keys[i] ? byKey.get(keys[i]) : null;
        if (url) next[slot] = url;
      });

      const previous = held.current;
      held.current = got;
      setUrls(next);
      backend.releaseUrls(previous);
    })();

    return () => {
      alive = false;
    };
  }, [signature, enabled, ttlSeconds]);

  // 화면을 떠날 때 마지막 한 벌을 거둔다
  useEffect(() => {
    return () => {
      getBackend().releaseUrls(held.current);
      held.current = [];
    };
  }, []);

  return urls;
}

/**
 * 내보내기에 쓴 원본을 몇 장 붙잡아 둔다.
 *
 * 저장소에서 파일을 직접 받는 길은 브라우저 캐시를 타지 않는다. 그대로 두면 배경을 바꾸지도
 * 않았는데 내보내기를 누를 때마다 같은 사진 몇 MB를 새로 받는다 — 확인하며 몇 번씩 누르는 자리다.
 *
 * 키는 올릴 때 한 번 발급되고 그 뒤로 내용이 바뀌지 않으므로, 키가 같으면 같은 그림이다.
 * 배경·표지·로고 세 장에 방금 갈아 끼운 것까지 들어갈 만큼만 남기고 오래된 것부터 버린다.
 */
const CACHE_MAX = 4;
const cache = new Map<string, Blob>();

async function fetchOriginal(key: string): Promise<Blob | undefined> {
  const hit = cache.get(key);
  if (hit) {
    // 다시 꺼내 쓴 것은 가장 최근 것으로 옮긴다 — 버릴 때 이것부터 버리지 않도록
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const blob = await getBackend()
    .getImage(key)
    .catch(() => undefined);
  if (!blob) return undefined;

  cache.set(key, blob);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return blob;
}

/**
 * 내보내기에 쓸 원본 주소. 필요한 순간에만 받는다.
 *
 * 화면용 축소본을 그대로 캡처하면 인쇄 화질이 축소본 화질로 내려앉는다.
 * 그리고 여기서는 서명한 주소가 아니라 파일을 직접 받아 blob 주소를 만든다 —
 * html-to-image가 바깥 주소의 그림을 캡처에 담지 못하는 경우가 있기 때문이다.
 */
export async function loadFullThemeImages(
  theme: Theme,
): Promise<{ urls: ThemeUrls; release: () => void }> {
  const pairs: [keyof ThemeUrls, string | undefined][] = [
    ["background", theme.backgroundUrl],
    ["cover", theme.coverUrl],
    ["logo", theme.logoUrl],
  ];

  const made: string[] = [];
  const urls: ThemeUrls = {};

  await Promise.all(
    pairs.map(async ([slot, key]) => {
      if (!key) return;
      const blob = await fetchOriginal(key);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      made.push(url);
      urls[slot] = url;
    }),
  );

  return { urls, release: () => made.forEach((u) => URL.revokeObjectURL(u)) };
}
