"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saveBlob } from "@/lib/exportImages";
import {
  buildPosterPdf,
  canvasToBlob,
  POSTER_DPI,
  posterPixelLabel,
  renderPosterToCanvas,
  type PosterDpi,
} from "@/lib/qrPoster";
import { Btn, Hint, Section, Warn } from "../ui";

/** 미리보기는 화면에 보일 만큼만 그린다. 인쇄물이 아니므로 낮게 잡아 빨리 뜨게 한다. */
const PREVIEW_DPI = 110;

/**
 * QR에는 지금 보고 있는 주소가 그대로 들어간다.
 * 개발용 주소로 뽑은 포스터는 이 컴퓨터에서만 열려, 벽에 붙여도 교인 폰에서는 아무것도 안 뜬다.
 * 종이로 나가기 전에 붙잡아야 하는 실수라 미리 알린다.
 */
function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  } catch {
    return false;
  }
}

/**
 * 교회 입구에 붙일 QR 포스터.
 *
 * QR 이미지만 받으면 교회에서 따로 종이에 붙여야 하고, 그러면 매번 모양이 달라진다.
 * 청년부 디자인에 QR을 얹은 A4 한 장을 그대로 내주면 뽑아서 붙이기만 하면 된다.
 */
export function QrPoster({ url }: { url: string }) {
  const [preview, setPreview] = useState<string>();
  /** 값이 있는 동안만 인쇄용 포스터가 화면에 올라가 있다 */
  const [printSrc, setPrintSrc] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [dpi, setDpi] = useState<PosterDpi>(300);

  /** 같은 주소로는 몇 번을 눌러도 같은 포스터다. 6MB 원본을 다시 읽지 않게 들고 있는다. */
  const pdfCache = useRef<{ url: string; bytes: Uint8Array } | null>(null);
  const printImage = useRef<{ url: string; src: string } | null>(null);
  const objectUrls = useRef<string[]>([]);

  useEffect(
    () => () => {
      objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  /*
   * 인쇄창은 포스터가 화면에 실제로 칠해진 뒤에 열어야 한다.
   * 먼저 열면 아직 아무것도 없는 상태가 종이에 찍힌다 — 두 프레임을 기다려 그 뒤에 연다.
   * 닫힌 뒤에는 포스터를 거둬야 사용자가 직접 인쇄할 때 주보 대신 포스터가 나가지 않는다.
   */
  useEffect(() => {
    if (!printSrc) return;

    let frame = 0;
    const done = () => setPrintSrc(undefined);

    // afterprint를 흘리는 브라우저가 있어 인쇄 모드가 풀리는 것도 함께 지켜본다.
    // 둘 다 놓치면 포스터가 화면에 남아, 나중에 사용자가 직접 인쇄할 때 이것이 나간다.
    const mq = window.matchMedia("print");
    const onMedia = (e: MediaQueryListEvent) => {
      if (!e.matches) done();
    };

    window.addEventListener("afterprint", done);
    mq.addEventListener("change", onMedia);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => window.print());
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
      mq.removeEventListener("change", onMedia);
    };
  }, [printSrc]);

  function keepUrl(blob: Blob): string {
    const u = URL.createObjectURL(blob);
    objectUrls.current.push(u);
    return u;
  }

  async function ensurePdf(): Promise<Uint8Array> {
    if (pdfCache.current?.url === url) return pdfCache.current.bytes;
    const bytes = await buildPosterPdf(url);
    pdfCache.current = { url, bytes };
    return bytes;
  }

  /** 눌린 버튼 하나만 돌게 하고, 실패하면 그 자리에 이유를 남긴다 */
  async function run(label: string, job: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError(undefined);
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "포스터를 만들지 못했습니다.");
    } finally {
      setBusy(undefined);
    }
  }

  const showPreview = () =>
    run("preview", async () => {
      const canvas = await renderPosterToCanvas(await ensurePdf(), PREVIEW_DPI);
      setPreview(keepUrl(await canvasToBlob(canvas)));
    });

  const downloadPdf = () =>
    run("pdf", async () => {
      const bytes = await ensurePdf();
      // 원본을 건드리지 않도록 복사본으로 파일을 만든다
      saveBlob(new Blob([bytes.slice().buffer], { type: "application/pdf" }), "교회QR포스터_A4.pdf");
    });

  const downloadImage = () =>
    run("image", async () => {
      const canvas = await renderPosterToCanvas(await ensurePdf(), dpi);
      saveBlob(await canvasToBlob(canvas), `교회QR포스터_A4_${dpi}dpi.png`);
    });

  const print = () =>
    run("print", async () => {
      if (printImage.current?.url !== url) {
        // 인쇄는 300dpi로 고정한다. 종이에서 이보다 더 촘촘한 차이는 눈에 띄지 않는다.
        const canvas = await renderPosterToCanvas(await ensurePdf(), 300);
        const src = keepUrl(await canvasToBlob(canvas));
        // 미리 풀어두면 인쇄창을 열 때 그림이 곧바로 자리에 앉는다
        const probe = new Image();
        probe.src = src;
        await probe.decode();
        printImage.current = { url, src };
      }
      setPrintSrc(printImage.current.src);
    });

  return (
    <Section
      title="교회 QR 포스터"
      desc="청년부 디자인에 QR을 얹은 A4 한 장입니다. 뽑아서 입구에 붙이면 됩니다."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className="mx-auto w-[132px] shrink-0 overflow-hidden rounded-xl border bg-white sm:mx-0"
          style={{ borderColor: "var(--ui-border)", aspectRatio: "210 / 297" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="QR 포스터 미리보기" className="block h-full w-full" />
          ) : (
            <button
              type="button"
              onClick={showPreview}
              disabled={!!busy}
              className="h-full w-full text-[11px]"
              style={{ background: "#fff", border: "none", color: "var(--ui-muted)" }}
            >
              {busy === "preview" ? "그리는 중…" : "미리보기"}
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* 어떤 주소가 QR에 들어갔는지 뽑기 전에 눈으로 확인할 수 있게 한다 */}
          <p
            className="truncate text-[11px]"
            style={{ color: "var(--ui-muted)" }}
            title={url}
          >
            QR이 가리키는 곳 · <span style={{ color: "var(--ui-text)" }}>{url}</span>
          </p>

          {isLocalUrl(url) && (
            <Warn>
              지금 주소는 이 컴퓨터에서만 열립니다. 이대로 뽑아 붙이면 교인 폰에서는 아무것도 보이지
              않습니다. 배포된 주소로 접속해서 다시 뽑아주세요.
            </Warn>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Btn variant="primary" disabled={!!busy} onClick={downloadPdf}>
              {busy === "pdf" ? "만드는 중…" : "PDF로 받기"}
            </Btn>
            <Btn disabled={!!busy} onClick={print}>
              {busy === "print" ? "준비 중…" : "A4로 인쇄"}
            </Btn>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
              이미지
            </span>
            {POSTER_DPI.map((d) => (
              <Btn
                key={d.dpi}
                size="sm"
                variant={dpi === d.dpi ? "primary" : "default"}
                onClick={() => setDpi(d.dpi)}
                title={`${d.desc} · ${posterPixelLabel(d.dpi)}px`}
              >
                {d.label}
              </Btn>
            ))}
            <Btn size="sm" disabled={!!busy} onClick={downloadImage}>
              {busy === "image" ? "만드는 중…" : "받기"}
            </Btn>
            <span className="text-[11px] tabular-nums" style={{ color: "var(--ui-muted)" }}>
              {posterPixelLabel(dpi)}
            </span>
          </div>

          {error && <Warn>{error}</Warn>}

          <Hint>
            PDF는 원본 그대로라 글자와 로고가 아무리 확대해도 깨지지 않습니다. 인쇄할 거라면 PDF를
            권합니다. 밴드·카톡에 올릴 거라면 이미지로 받으세요. QR은 주소가 하나뿐이라 한 번만
            뽑으면 매주 다시 뽑지 않아도 됩니다.
          </Hint>
          {/*
           * 여백 없이 인쇄되도록 스타일에 적어두었지만, 인쇄창에서 사람이 다시 바꿀 수 있다.
           * 흰 테두리가 남은 채로 뽑고 나서야 알게 되는 일이라 미리 적어 둔다.
           */}
          <Hint>
            인쇄창이 뜨면 <b>여백 «없음»</b>, <b>배경 그래픽 켜기</b>로 두어야 A4에 가장자리까지
            꽉 찹니다.
          </Hint>
        </div>
      </div>

      {/*
       * 인쇄용 그림은 화면에서는 숨어 있다가 인쇄할 때만 종이 한 장을 가득 채운다.
       * body 바로 아래에 두어야 인쇄 스타일이 나머지 화면을 걷어낼 수 있다.
       */}
      {printSrc &&
        createPortal(
          <div id="poster-print" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={printSrc} alt="" />
          </div>,
          document.body,
        )}
    </Section>
  );
}
