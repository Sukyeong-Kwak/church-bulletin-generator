"use client";

import { useMemo, useRef, useState } from "react";
import { ExportLayer } from "@/components/ExportLayer";
import { ExportPanel } from "@/components/editor/ExportPanel";
import { PreviewGrid } from "@/components/PreviewGrid";
import { Hint } from "@/components/ui";
import { formatServiceDate } from "@/lib/layout";
import { useFlowPages, withFixedPages } from "@/lib/paginate";
import { useDoc } from "@/lib/store";
import { useFitScale } from "@/lib/useFitScale";

/**
 * 주보 전체 보기 — 표지부터 마지막 장까지 순서대로 확인하고 이미지로 내보낸다.
 * 작성 화면은 본문에 집중하고, 완성본 확인과 내보내기는 이 화면에서 한다.
 */
export default function PreviewPage() {
  const { doc, setDoc, urls, attachImages, loaded } = useDoc();
  const { pages: flowPages, measurer, measuring } = useFlowPages(doc);
  const pages = useMemo(() => withFixedPages(flowPages), [flowPages]);

  const nodes = useRef(new Map<number, HTMLDivElement | null>());
  // 화면 폭에 맞춰 두다가, 사용자가 손대는 순간부터 그 값을 지킨다
  const fit = useFitScale(0.42);
  const [picked, setPicked] = useState<number | null>(null);
  const zoom = picked ?? fit;

  const getNodes = (): HTMLElement[] =>
    pages.map((p) => nodes.current.get(p.index)).filter((el): el is HTMLDivElement => !!el);

  const overflowCount = pages.filter((p) => p.overflow).length;

  if (!loaded) return null;

  return (
    <div className="flex h-full flex-col">
      <ExportPanel
        doc={doc}
        setDoc={setDoc}
        getNodes={getNodes}
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
        {overflowCount > 0 && (
          <span
            className="rounded px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "#fff4e6", color: "#b45309" }}
          >
            {overflowCount}개 페이지에서 내용이 넘칩니다
          </span>
        )}
        <label
          className="ml-auto flex items-center gap-1.5 text-[11px]"
          style={{ color: "var(--ui-muted)" }}
        >
          확대
          <input
            type="range"
            min={0.15}
            max={0.9}
            step={0.05}
            value={zoom}
            onChange={(e) => setPicked(Number(e.target.value))}
            style={{ width: 110 }}
          />
          {Math.round(zoom * 100)}%
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <PreviewGrid doc={doc} pages={pages} urls={urls} scale={zoom} />
        {pages.length === 2 && (
          <div className="mt-3">
            <Hint>
              아직 본문이 없어 고정 페이지 2장만 있습니다. 주간 주보 작성에서 광고를 넣어주세요.
            </Hint>
          </div>
        )}
      </div>

      {/* 표시와 무관하게 항상 전체 페이지를 원본 크기로 캡처한다 */}
      <ExportLayer
        doc={doc}
        pages={pages}
        urls={urls}
        registerRef={(i, el) => nodes.current.set(i, el)}
      />
      {measurer}
    </div>
  );
}
