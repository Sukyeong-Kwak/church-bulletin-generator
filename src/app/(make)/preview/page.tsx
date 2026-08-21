"use client";

import { useMemo, useRef, useState } from "react";
import { ExportLayer } from "@/components/ExportLayer";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { QrPoster } from "@/components/editor/QrPoster";
import { ShareCard } from "@/components/editor/ShareCard";
import { PreviewGrid } from "@/components/PreviewGrid";
import { OverflowNotice } from "@/components/editor/OverflowNotice";
import { ZoomSlider } from "@/components/editor/ZoomSlider";
import { Btn, Hint } from "@/components/ui";
import { afterPaint, waitForNodes } from "@/lib/exportImages";
import { formatServiceDate } from "@/lib/layout";
import { useFlowPages, withFixedPages } from "@/lib/paginate";
import { nowUrl } from "@/lib/publish";
import { useDoc } from "@/lib/store";
import { useEditFocus } from "@/lib/useEditFocus";
import { useZoom } from "@/lib/useZoom";
import { loadFullThemeImages, type ThemeUrls } from "@/lib/useThemeImages";

/**
 * 주보 전체 보기 — 표지부터 마지막 장까지 순서대로 확인하고 이미지로 내보낸다.
 * 작성 화면은 본문에 집중하고, 완성본 확인과 내보내기는 이 화면에서 한다.
 */
export default function PreviewPage() {
  const { doc, setDoc, urls, attachImages, loaded } = useDoc();
  const { pages: flowPages, measurer, measuring } = useFlowPages(doc);
  const pages = useMemo(() => withFixedPages(flowPages), [flowPages]);

  const nodes = useRef(new Map<number, HTMLDivElement | null>());
  /**
   * 내보내기용 원본 크기 레이어는 내보낼 때만 붙인다.
   *
   * 예전에는 편집하는 내내 화면 밖에 같은 페이지를 한 벌 더 그려두었다. 여덟 장짜리 주보라면
   * 보이는 여덟 장과 보이지 않는 여덟 장을 글자 한 자 칠 때마다 다시 그린 셈이다.
   * 배경 사진까지 원본 크기로 딸려 있어 값이 가장 비싼 쪽이 보이지 않는 쪽이었다.
   *
   * 여기에 값이 담겨 있는 동안만 레이어가 산다. 담기는 것은 원본 주소다 —
   * 캡처는 화면용 축소본이 아니라 원본을 찍어야 인쇄 화질이 나온다.
   */
  const [exportUrls, setExportUrls] = useState<ThemeUrls | null>(null);
  // 저장하면 공유 링크가 생기므로 QR을 바로 펼쳐 보여준다
  const [showShare, setShowShare] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  /** QR은 통 맨 위에 붙는다 — 아래쪽을 보던 중에 열면 눌러놓고 아무 일도 안 일어난 것처럼 보인다 */
  const toggleShare = () => {
    if (!showShare) scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
    setShowShare((v) => !v);
  };

  // 화면 폭에 맞춰 두다가, 손대는 순간부터 그 값을 지키고 다음에 올 때도 그대로 맞이한다
  const { zoom, setZoom } = useZoom("preview", 0.42);
  const { goEdit } = useEditFocus();

  /**
   * 내보내기 레이어를 잠깐 띄우고, 그 위에서 할 일을 한 뒤 도로 걷는다.
   * 내보내기와 QR 올리기가 똑같이 이 길로 지나가므로 레이어를 챙기는 자리는 여기 하나뿐이다.
   *
   * 한 번에 하나씩만 지나간다.
   *
   * 레이어도, 그 안의 원본 주소도 한 벌뿐이다. 두 곳이 겹쳐 들어오면 — 내보내기가 8장을 굽는
   * 십여 초 사이에 교회 QR을 열어 올리기를 누르는 식으로 — 먼저 끝난 쪽이 마무리하면서
   * 상대가 아직 찍고 있는 레이어를 걷고 주소를 거둬버린다. 남은 쪽은 빈 장을 찍는다.
   * 두 버튼이 서로의 사정을 모르므로(각자 다른 표시로 잠근다) 순서는 여기서 세운다.
   */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function runWithNodes<T>(run: (nodes: HTMLElement[]) => Promise<T>): Promise<T> {
    // 앞의 것이 실패했더라도 줄은 계속 나아간다
    const mine = queue.current.then(
      () => captureWith(run),
      () => captureWith(run),
    );
    queue.current = mine.catch(() => undefined);
    return mine;
  }

  async function captureWith<T>(run: (nodes: HTMLElement[]) => Promise<T>): Promise<T> {
    const full = await loadFullThemeImages(doc.theme);
    setExportUrls(full.urls);
    try {
      const ready = await waitForNodes(
        () => pages.map((p) => nodes.current.get(p.index)).filter((el): el is HTMLDivElement => !!el),
        pages.length,
      );
      return await run(ready);
    } finally {
      setExportUrls(null);
      nodes.current.clear();
      // 레이어가 실제로 걷힌 뒤에 주소를 거둔다 — 아직 보고 있는데 지우면 빈칸이 스친다
      await afterPaint();
      full.release();
    }
  }

  if (!loaded) return null;

  return (
    <div className="flex h-full flex-col">
      <ExportPanel
        doc={doc}
        setDoc={setDoc}
        runWithNodes={runWithNodes}
        onImagesReady={attachImages}
        pageCount={pages.length}
      />

      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-white px-4 py-2"
        style={{ borderColor: "var(--ui-border)" }}
      >
        <span className="text-[13px] font-bold">
          {formatServiceDate(doc.serviceDate)} · 전체 {pages.length}페이지
        </span>
        {measuring && (
          <span className="text-[11px]" style={{ color: "var(--ui-muted)" }}>
            조판 계산 중…
          </span>
        )}
        <OverflowNotice setDoc={setDoc} pages={pages} />
        <Btn size="sm" variant={showShare ? "primary" : "default"} onClick={toggleShare}>
          교회 QR
        </Btn>

        <ZoomSlider zoom={zoom} onChange={setZoom} />
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-auto p-4">
        {/*
         * QR은 미리보기와 같은 통 안에 둔다.
         * 밖에 두면 화면이 낮을 때 미리보기가 0까지 밀려 종잇장처럼 눌린다 —
         * 같은 통에 있으면 둘 다 제 높이를 지키고 화면이 대신 굴러간다.
         */}
        {showShare && (
          <div className="mb-4 flex flex-col gap-3">
            <ShareCard runWithNodes={runWithNodes} />
            <QrPoster url={nowUrl()} />
          </div>
        )}

        <PreviewGrid doc={doc} pages={pages} urls={urls} scale={zoom} onEdit={goEdit} />
        {pages.length === 2 && (
          <div className="mt-3">
            <Hint>
              아직 본문이 없어 고정 페이지 2장만 있습니다. 주간 주보 작성에서 광고를 넣어주세요.
            </Hint>
          </div>
        )}
      </div>

      {/* 내보내는 동안에만. 전체 페이지를 축소 없이 원본 크기 그대로 그려 캡처에 넘긴다. */}
      {exportUrls && (
        <ExportLayer
          doc={doc}
          pages={pages}
          urls={exportUrls}
          registerRef={(i, el) => nodes.current.set(i, el)}
        />
      )}
      {measurer}
    </div>
  );
}
