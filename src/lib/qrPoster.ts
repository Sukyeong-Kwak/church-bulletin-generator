"use client";

/**
 * 교회 입구에 붙이는 QR 포스터.
 *
 * 청년부에서 받은 A4 디자인(분홍 니트 배경 + 아치 카드 + 더 피스 로고)에
 * `/now` QR만 얹는다. 디자인을 이미지로 한 번 구워 다시 쓰면 그때마다 화질이
 * 깎이므로, 원본 PDF를 템플릿 그대로 두고 QR만 덧그린다.
 *   PDF로 받으면  글자·로고가 벡터 그대로라 몇 배로 확대해도 깨지지 않는다.
 *   이미지로 받으면 그 PDF를 원하는 해상도로 그 자리에서 그려낸다.
 */

/** 원본 PDF 한 페이지의 크기. A4를 포인트로 적은 값이다. */
const PAGE_W = 595.27566;
const PAGE_H = 841.889862;

/**
 * QR 자리 — 카드 안의 빈 곳을 제목 아래부터 로고 위까지 거의 다 쓴다.
 *
 * 한 변 355pt는 약 12.5cm다. 이 포스터는 벽에 붙여놓고 지나가며 찍는 것이라
 * 작게 넣으면 가까이 다가서야 잡힌다 — 남는 자리는 다 QR에 준다.
 * 가로는 페이지 한가운데에 세운다(카드도 페이지 한가운데에 있다).
 */
const QR_SIZE = 355;
const QR_TOP = 310;

export const POSTER_TEMPLATE_URL = "/poster/qr-poster.pdf";

/** 내려받을 수 있는 해상도. A4(210×297mm) 기준 실제 픽셀도 함께 적는다. */
export const POSTER_DPI = [
  { dpi: 150, label: "150dpi", desc: "화면·카톡 공유용" },
  { dpi: 300, label: "300dpi", desc: "A4 인쇄용 (권장)" },
  { dpi: 600, label: "600dpi", desc: "인쇄소 맡길 때" },
] as const;

export type PosterDpi = (typeof POSTER_DPI)[number]["dpi"];

/** 그 해상도로 뽑았을 때의 픽셀 크기 (예: "2480 × 3508") */
export function posterPixelLabel(dpi: number): string {
  const k = dpi / 72;
  return `${Math.round(PAGE_W * k)} × ${Math.round(PAGE_H * k)}`;
}

/** 6MB짜리 원본이라 한 번만 받아 두고 다시 쓴다 */
let templateCache: Promise<ArrayBuffer> | null = null;

function loadTemplate(): Promise<ArrayBuffer> {
  if (!templateCache) {
    templateCache = fetch(POSTER_TEMPLATE_URL)
      .then((res) => {
        if (!res.ok) throw new Error("포스터 원본을 찾지 못했습니다.");
        return res.arrayBuffer();
      })
      .catch((e: unknown) => {
        // 실패한 약속을 남겨두면 다시 눌러도 계속 같은 실패가 나온다
        templateCache = null;
        throw e;
      });
  }
  return templateCache;
}

/**
 * 원본 PDF에 QR을 얹은 새 PDF를 만든다.
 *
 * QR의 밝은 칸은 투명하게 둔다. 카드 바탕이 그대로 비쳐 흰 네모가 덧대어진
 * 것처럼 보이지 않고, 바탕이 충분히 밝아 조용한 여백 노릇도 대신한다.
 */
export async function buildPosterPdf(url: string): Promise<Uint8Array> {
  const [{ PDFDocument }, qrcode, template] = await Promise.all([
    import("pdf-lib"),
    import("qrcode"),
    loadTemplate(),
  ]);

  // 600dpi에서 QR이 차지하는 폭은 2958px이다. 그보다 크게 그려두면 늘려서 흐려질 일이 없다.
  const qrDataUrl = await qrcode.default.toDataURL(url, {
    width: 3200,
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000ff", light: "#00000000" },
  });

  const pdf = await PDFDocument.load(template);
  const page = pdf.getPage(0);
  const qr = await pdf.embedPng(qrDataUrl);

  page.drawImage(qr, {
    x: (PAGE_W - QR_SIZE) / 2,
    // PDF 좌표는 아래에서 위로 올라간다. 위에서 잰 값을 뒤집어 준다.
    y: PAGE_H - QR_TOP - QR_SIZE,
    width: QR_SIZE,
    height: QR_SIZE,
  });

  return pdf.save();
}

let workerReady = false;

/** PDF 한 페이지를 원하는 해상도로 그려낸다 */
export async function renderPosterToCanvas(
  pdfBytes: Uint8Array,
  dpi: number,
): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerReady) {
    /*
     * 일꾼(worker) 파일을 public에 복사해두면 pdfjs-dist를 올릴 때 조용히 어긋난다 —
     * 판이 다르면 pdf.js가 아예 멈춘다. 번들러가 같은 꾸러미에서 꺼내오게 두어
     * 둘이 항상 같은 판이 되게 한다.
     */
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" },
    );
    workerReady = true;
  }

  // pdf.js는 넘긴 버퍼를 워커로 넘기며 비워 버린다. 원본은 따로 쓰므로 복사해서 준다.
  const task = pdfjs.getDocument({ data: pdfBytes.slice() });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    try {
      await page.render({ canvas, viewport }).promise;
    } catch (e) {
      // 600dpi는 3천만 픽셀이 넘어 폰·태블릿에서는 자리를 못 잡는 일이 있다.
      // 원인이 영어로 튀어나오면 무엇을 해야 할지 알 수 없으므로 할 일을 적어 준다.
      if (dpi > 300) {
        throw new Error(
          "이 기기에서는 600dpi가 너무 큽니다. 300dpi로 받거나, PDF로 받아 인쇄해 주세요.",
        );
      }
      throw e;
    }
    return canvas;
  } finally {
    // 6MB 원본을 들고 있는 워커까지 함께 접는다. 600dpi를 몇 번 뽑으면 무시 못 할 양이 된다.
    void doc.cleanup();
    void task.destroy();
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지를 만들지 못했습니다."))),
      type,
    ),
  );
}
