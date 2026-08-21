"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CANVAS } from "@/lib/layout";
import { useFlowPages, withFixedPages } from "@/lib/paginate";
import { useFitScale } from "@/lib/useFitScale";
import { useThemeImages } from "@/lib/useThemeImages";
import type { BulletinDoc } from "@/lib/types";
import { NowFrame } from "./NowFrame";
import { PreviewGrid } from "./PreviewGrid";

/**
 * 이미지 없이 올라온 주보 — 화면에서 다시 그려 보여준다.
 *
 * 내보낸 이미지가 붙어 있으면 그쪽이 먼저다(SharedView). 여기로 오는 것은 이미지가
 * 만들어지기 전에 적용됐거나 옛 방식으로 저장된 주보인데, 보는 사람에게는 둘이 같은
 * 이번 주 주보다. 그래서 겉틀은 NowFrame으로 똑같이 두고 가운데만 다르게 채운다.
 */
export function SharedBulletin({ doc, nav }: { doc: BulletinDoc; nav?: ReactNode }) {
  const { pages: flowPages, measurer } = useFlowPages(doc);
  const pages = useMemo(() => withFixedPages(flowPages), [flowPages]);

  const urls = useThemeImages(doc.theme);

  // 폰에서는 주보 한 장이 화면 폭에 통째로 들어오게 맞추고, 손대면 그 값을 지킨다
  const fit = useFitScale(0.42, 0.6, 32);
  const [picked, setPicked] = useState<number | null>(null);
  const zoom = picked ?? fit;

  return (
    <NowFrame
      doc={doc}
      pageCount={pages.length}
      nav={nav}
      action={
        // 폰에서는 손가락으로 벌리면 되므로, 조절기는 그럴 수 없는 큰 화면에서만 내놓는다
        <label
          className="hidden items-center gap-1.5 text-[11px] sm:flex"
          style={{ color: "var(--ui-muted)" }}
        >
          확대
          <input
            type="range"
            min={0.2}
            max={0.9}
            step={0.05}
            value={zoom}
            onChange={(e) => setPicked(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </label>
      }
    >
      {/*
        딱 한 쪽 너비로 잡아 가운데 세운다.
        넓은 화면에서 두 쪽씩 나란히 놓이면 눈이 좌우로 갈라진다 — 위에서 아래로만 읽히게.
      */}
      <div className="mx-auto" style={{ width: CANVAS.w * zoom }}>
        <PreviewGrid doc={doc} pages={pages} urls={urls} scale={zoom} showCaption={false} />
      </div>

      {measurer}
    </NowFrame>
  );
}
