"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SplitView } from "@/components/SplitView";
import { AdPaste } from "@/components/editor/AdPaste";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { PreviewGrid } from "@/components/PreviewGrid";
import { Btn, Hint, Section } from "@/components/ui";
import { CANVAS } from "@/lib/layout";
import { useFlowPages, withFixedPages } from "@/lib/paginate";
import { useDoc } from "@/lib/store";
import type { AdBlock } from "@/lib/types";

export default function EditorPage() {
  const { doc, setDoc, urls, loaded } = useDoc();
  const { pages: flowPages, measurer, measuring } = useFlowPages(doc);
  const pages = useMemo(() => withFixedPages(flowPages), [flowPages]);

  const [pasteOpen, setPasteOpen] = useState(false);
  // 좁은 화면에서는 한 장이 화면 폭에 맞게 보이도록 시작 배율을 조정한다.
  // 미리보기는 loaded 이후(클라이언트)에만 그려지므로 초기값에서 창 크기를 읽어도 안전하다.
  const [zoom, setZoom] = useState(() => {
    if (typeof window === "undefined") return 0.3;
    const w = window.innerWidth;
    return w < 1024 ? Math.min(0.55, (w - 48) / CANVAS.w) : 0.3;
  });

  const applyAds = (blocks: AdBlock[], mode: "replace" | "append") => {
    setDoc((d) => {
      const others = d.blocks.filter((b) => b.kind !== "ad");
      const ads =
        mode === "replace"
          ? blocks
          : [...d.blocks.filter((b): b is AdBlock => b.kind === "ad"), ...blocks];
      return { ...d, blocks: [...ads, ...others] };
    });
    setPasteOpen(false);
  };

  // 이 화면은 본문(광고·주요일정·설교) 작성에 집중한다. 고정 페이지는 전체 보기에서 확인한다.
  const visiblePages = pages.filter((p) => p.kind === "flow");
  const overflowCount = visiblePages.filter((p) => p.overflow).length;

  if (!loaded) return null;

  return (
    <>
      <SplitView
        panel={<>
        <Section
          title="광고"
          desc="구글 문서 내용을 붙여넣으면 블록으로 자동 변환됩니다."
          right={
            <Btn size="sm" variant="primary" onClick={() => setPasteOpen(true)}>
              붙여넣기
            </Btn>
          }
        >
          <BlockEditor doc={doc} setDoc={setDoc} />
        </Section>

        <Hint>
          날짜·배경·교회 정보는{" "}
          <Link href="/common" style={{ color: "var(--ui-accent)", fontWeight: 700 }}>
            전체 공통
          </Link>
          , 표지와 청년부 일정은{" "}
          <Link href="/fixed" style={{ color: "var(--ui-accent)", fontWeight: 700 }}>
            고정 페이지
          </Link>
          에서 수정합니다.
        </Hint>
          </>
        }
        previewToolbar={
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-white px-4 py-2"
            style={{ borderColor: "var(--ui-border)" }}
          >
            <span className="text-[12px] font-bold">본문 미리보기 · {visiblePages.length}장</span>
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
                {overflowCount}개 페이지에서 내용이 넘칩니다 — 폰트 크기를 줄이거나 블록을 나눠주세요
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
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: 110 }}
              />
              {Math.round(zoom * 100)}%
            </label>
          </div>
        }
        preview={
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <PreviewGrid doc={doc} pages={visiblePages} urls={urls} scale={zoom} />
            {visiblePages.length === 0 && (
              <Hint>
                본문 내용이 아직 없습니다. 광고를 붙여넣거나 본문 말씀을 입력하면 여기에 나타납니다.
              </Hint>
            )}
          </div>
        }
      />

      {measurer}
      {pasteOpen && <AdPaste onApply={applyAds} onClose={() => setPasteOpen(false)} />}
    </>
  );
}
