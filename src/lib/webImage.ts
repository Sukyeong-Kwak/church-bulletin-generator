"use client";

/**
 * 화면용 축소본.
 *
 * 내보내는 이미지는 인쇄와 밴드 게시를 위해 3배(2673×3780)로 만든다. 그런데 폰으로
 * QR을 찍고 들어온 사람 화면은 400px 남짓이다. 그 한 장을 위해 3MB를 내려받는 셈이라,
 * 여섯 장이면 예배 시작 전에 다 뜨지 않는다.
 *
 * 그래서 원본은 그대로 두고, 화면에 걸기만 할 축소본을 한 벌 더 만들어 함께 보관한다.
 * 받는 쪽은 축소본을, 저장 단추를 누른 사람만 원본을 받는다.
 */

/** 축소본의 최대 가로 픽셀. 폰(400px·3배 밀도)에서도 또렷하고, 장당 200~400KB에 든다. */
export const WEB_MAX_WIDTH = 1400;

/** 축소본 JPG 품질. 화면으로 보아서는 원본과 구분되지 않는 선. */
const WEB_QUALITY = 0.82;

/** 축소본이 사는 폴더. 이 아래 것은 다시 줄이지 않는다. */
const WEB_ROOT = "web/";

/**
 * 원본 키에서 축소본 키를 만든다.
 *
 * 어느 원본의 축소본인지를 표에 따로 적지 않고 키 규칙 하나로 정한다.
 * 칸이 늘면 옛 주보에는 그 칸이 비어 있어 결국 '있으면 쓰고 없으면 원본'을 어차피 해야 하는데,
 * 규칙으로 두면 그 판단이 파일이 있느냐 없느냐 한 가지로 끝난다.
 */
export function webKeyFor(key: string): string {
  if (key.startsWith(WEB_ROOT)) return key;
  return `${WEB_ROOT}${key.replace(/\.[^./]+$/, "")}.jpg`;
}

/**
 * 이미지를 화면용 크기로 줄인다. 이미 작으면 줄이지 않고 null을 돌려준다 —
 * 원본보다 큰 축소본을 만들어 두면 받는 쪽이 손해를 본다.
 *
 * 뒤가 비치는 그림도 줄이지 않는다. JPG에는 투명이 없어 비치는 자리가 검게 메워지는데,
 * 화면에는 축소본이 걸리고 내보내기는 원본을 쓰므로 '미리보기만 까맣고 내보낸 것은 멀쩡한'
 * 어긋난 상태가 된다. 무엇으로 쓰려고 올린 파일인지가 아니라 파일 자체를 보고 정한다 —
 * 로고만 조심하면 될 것 같지만, 뒤가 비치는 PNG를 배경이나 표지로 올리는 일도 얼마든지 있다.
 */
export async function makeWebCopy(blob: Blob, maxWidth = WEB_MAX_WIDTH): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    // 브라우저가 못 읽는 형식이면 축소본 없이 간다. 원본은 그대로 쓸 수 있다.
    return null;
  }

  try {
    if (bitmap.width <= maxWidth) return null;

    const w = maxWidth;
    const h = Math.max(1, Math.round((bitmap.height * maxWidth) / bitmap.width));
    const canvas = downscale(bitmap, w, h);
    if (!canvas) return null;
    if (hasTransparency(canvas)) return null;

    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", WEB_QUALITY),
    );
    // 줄였는데 더 커졌다면(작고 단순한 PNG 같은 것) 원본을 쓰는 편이 낫다
    return out && out.size < blob.size ? out : null;
  } finally {
    bitmap.close();
  }
}

/**
 * 비치는 자리가 한 점이라도 있는가.
 *
 * 줄여놓은 그림에서 본다 — 원본을 훑는 것보다 읽을 점이 훨씬 적고, 어차피 JPG로 구울 것이
 * 이 그림이라 여기 없는 투명은 결과에도 없다. 올릴 때 한 번 하는 일이라 이 정도는 든다.
 */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return true; // 확인할 수 없으면 만들지 않는다 — 잘못 구우면 까맣게 남는다

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return true;
  }

  // 알파는 네 칸마다 한 번씩 온다
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/**
 * 한 번에 크게 줄이면 캔버스가 픽셀을 건너뛰며 읽어 글자 획이 끊긴다.
 * 절반씩 접어 내려가면 매 단계가 이웃 네 점의 평균이 되어 획이 살아남는다.
 */
function downscale(bitmap: ImageBitmap, w: number, h: number): HTMLCanvasElement | null {
  let src: CanvasImageSource = bitmap;
  let sw = bitmap.width;
  let sh = bitmap.height;

  while (sw > w * 2) {
    const half = step(src, Math.round(sw / 2), Math.round(sh / 2));
    if (!half) return null;
    src = half;
    sw = half.width;
    sh = half.height;
  }

  return step(src, w, h);
}

function step(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}
