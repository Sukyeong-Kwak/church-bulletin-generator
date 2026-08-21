"use client";

import { toCanvas } from "html-to-image";
import JSZip from "jszip";
import { CANVAS } from "./layout";
import type { ExportFormat, ExportScale } from "./types";

/**
 * 주보 폰트를 직접 data URL로 임베딩한다.
 *
 * html-to-image에 fontEmbedCSS를 넘기지 않으면 라이브러리가 문서의 모든 스타일시트를
 * 훑는데, 브라우저 확장 프로그램이 주입한 스타일시트에서 멈추는 경우가 있다.
 * 우리가 쓰는 폰트만 직접 넣으면 그 과정을 통째로 건너뛴다.
 */
// globals.css 의 @font-face 와 같은 파일을 가리켜야 한다. 없는 주소를 적으면 404 를 한 번 맞고 지나간다.
const FONT_SOURCES = [
  { family: "HSSaemaul", url: "/fonts/HSSaemaul.woff", mime: "font/woff", format: "woff" },
  { family: "ACCKidsHeart", url: "/fonts/ACCKidsHeart.woff", mime: "font/woff", format: "woff" },
  {
    family: "Cafe24Ssurround",
    url: "/fonts/Cafe24Ssurround.woff2",
    mime: "font/woff2",
    format: "woff2",
  },
  { family: "BMJUA", url: "/fonts/BMJUA.woff2", mime: "font/woff2", format: "woff2" },
  { family: "Jalnan", url: "/fonts/Jalnan.woff2", mime: "font/woff2", format: "woff2" },
];

let fontCssCache: string | null = null;

async function fontEmbedCSS(): Promise<string> {
  if (fontCssCache !== null) return fontCssCache;

  const parts: string[] = [];
  const done = new Set<string>();

  for (const f of FONT_SOURCES) {
    if (done.has(f.family)) continue;
    try {
      const res = await fetch(f.url);
      if (!res.ok) continue;
      const b64 = toBase64(await res.arrayBuffer());
      parts.push(
        `@font-face{font-family:"${f.family}";src:url(data:${f.mime};base64,${b64}) format("${f.format}");font-display:block;}`,
      );
      done.add(f.family);
    } catch {
      // 폰트 파일이 없으면 시스템 폰트로 그려진다
    }
  }

  fontCssCache = parts.join("\n");
  return fontCssCache;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * 페이지 노드를 그대로 래스터화한다.
 * 미리보기는 부모에서 transform:scale 로 줄여 보여줄 뿐이고,
 * 노드 자체는 항상 891×1260이므로 배율만큼 그대로 고화질로 나온다.
 *   2x → 1782×2520   3x → 2673×3780   4x → 3564×5040
 */
export async function renderPage(
  node: HTMLElement,
  scale: ExportScale,
  fonts: string,
  format: ExportFormat = "png",
): Promise<Blob> {
  const jpg = format === "jpg";

  // html-to-image의 toBlob은 형식·품질 옵션을 무시하고 항상 PNG를 만든다.
  // 캔버스를 직접 받아 변환해야 JPG 품질을 조절할 수 있다.
  const canvas = await withTimeout(
    toCanvas(node, {
      pixelRatio: scale,
      width: CANVAS.w,
      height: CANVAS.h,
      // JPG는 투명을 표현할 수 없어 배경을 흰색으로 채운다
      backgroundColor: jpg ? "#ffffff" : undefined,
      fontEmbedCSS: fonts,
      style: { transform: "none", margin: "0" },
    }),
    60000,
    "이미지 생성이 너무 오래 걸립니다. 배율을 낮춰서 다시 시도해 주세요.",
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(
      resolve,
      jpg ? "image/jpeg" : "image/png",
      // 0.88이면 육안으로는 무손실과 구분이 어렵고 용량은 크게 줄어든다
      jpg ? 0.88 : undefined,
    ),
  );
  if (!blob) throw new Error("이미지를 만들지 못했습니다.");
  return blob;
}

/** 화면이 멈춰 있어도 이만큼 지나면 한 번은 돌아본다 */
const TICK_MS = 250;

/**
 * 다음 그림이 그려질 때까지. 단, 마냥 기다리지는 않는다.
 *
 * requestAnimationFrame 은 탭이 뒤로 가면 아예 불리지 않는다. 내보내기는 몇 초씩 걸려서
 * 그동안 다른 탭을 보러 가는 것이 보통인데, rAF 만 기다리면 그 순간 여기서 잠들어 버린다 —
 * 아래 waitForNodes 의 시간 제한도 이 함수가 돌아와야 확인하므로 함께 잠든다.
 * 그래서 시계도 같이 걸어두고 먼저 오는 쪽을 받는다.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, TICK_MS);
  });
}

/**
 * 캡처할 노드가 DOM에 자리 잡고 그 안의 그림이 다 붙을 때까지 기다린다.
 *
 * 내보내기 레이어는 누를 때 비로소 붙는다. 붙자마자 캡처하면 아직 오지 않은 배경이
 * 빈칸으로 찍히므로, 다 왔는지 물어보고 나서 찍는다.
 * 오지 않는 그림 하나에 내보내기 전체가 걸리지 않도록 기다림에는 끝을 둔다.
 */
export async function waitForNodes(
  read: () => HTMLElement[],
  expected: number,
  timeoutMs = 15000,
): Promise<HTMLElement[]> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const nodes = read();
    const ready =
      nodes.length === expected &&
      nodes.every((n) => Array.from(n.querySelectorAll("img")).every((img) => img.complete));

    if (ready || Date.now() > deadline) return nodes;
    await nextFrame();
  }
}

/** 방금 바꾼 화면이 실제로 그려질 때까지 — 지운 주소를 아직 보고 있는 일이 없게 한다 */
export async function afterPaint(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

/**
 * html-to-image는 첫 호출에서 이미지·폰트가 덜 붙는 경우가 있어
 * 한 번 예열한 뒤 실제 결과를 받는다.
 */
export async function renderAll(
  nodes: HTMLElement[],
  scale: ExportScale,
  format: ExportFormat,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob[]> {
  const fonts = await fontEmbedCSS();
  const out: Blob[] = [];

  if (nodes.length > 0) {
    await renderPage(nodes[0], 2, fonts, format).catch(() => null);
  }
  for (let i = 0; i < nodes.length; i++) {
    out.push(await renderPage(nodes[i], scale, fonts, format));
    onProgress?.(i + 1, nodes.length);
  }
  return out;
}

export function fileNameFor(
  serviceDate: string,
  index: number,
  format: ExportFormat = "png",
): string {
  return `${serviceDate}_${index + 1}.${format}`;
}

/** 용량을 읽기 쉬운 단위로 */
export function formatBytes(bytes: number): string {
  const MB = 1024 * 1024;
  // 저장 공간은 GB 단위로 이야기하는 자리다 — 여기가 없으면 1GB 가 '1024.0MB'로 나온다
  if (bytes >= 1024 * MB) return `${(bytes / 1024 / MB).toFixed(2)}GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveZip(
  blobs: Blob[],
  serviceDate: string,
  format: ExportFormat = "png",
  zipName = `주보_${serviceDate}.zip`,
): Promise<void> {
  const zip = new JSZip();
  blobs.forEach((b, i) => zip.file(fileNameFor(serviceDate, i, format), b));
  const out = await zip.generateAsync({ type: "blob" });
  saveBlob(out, zipName);
}

/** 내보내기 배율별 실제 픽셀 크기 안내 */
export function pixelLabel(scale: ExportScale): string {
  return `${CANVAS.w * scale} × ${CANVAS.h * scale}`;
}
