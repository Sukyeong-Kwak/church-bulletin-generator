"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { CANVAS } from "@/lib/layout";
import { useFlowPages, withFixedPages } from "@/lib/paginate";
import { useFitScale } from "@/lib/useFitScale";
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
export function SharedBulletin({ doc }: { doc: BulletinDoc }) {
  const { pages: flowPages, measurer } = useFlowPages(doc);
  const pages = useMemo(() => withFixedPages(flowPages), [flowPages]);

  const [urls, setUrls] = useState<{ background?: string; cover?: string; logo?: string }>({});
  const created = useRef<string[]>([]);

  // 폰에서는 주보 한 장이 화면 폭에 통째로 들어오게 맞추고, 손대면 그 값을 지킨다
  const fit = useFitScale(0.42, 0.6, 32);
  const [picked, setPicked] = useState<number | null>(null);
  const zoom = picked ?? fit;

  const keys = `${doc.theme.backgroundUrl ?? ""}|${doc.theme.coverUrl ?? ""}|${doc.theme.logoUrl ?? ""}`;

  useEffect(() => {
    let alive = true;
    const made: string[] = [];

    (async () => {
      const backend = getBackend();
      const next: typeof urls = {};
      const pairs: [keyof typeof urls, string | undefined][] = [
        ["background", doc.theme.backgroundUrl],
        ["cover", doc.theme.coverUrl],
        ["logo", doc.theme.logoUrl],
      ];

      for (const [name, key] of pairs) {
        if (!key) continue;
        const blob = await backend.getImage(key).catch(() => undefined);
        if (blob) {
          const url = URL.createObjectURL(blob);
          next[name] = url;
          made.push(url);
        }
      }

      if (!alive) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      created.current.forEach((u) => URL.revokeObjectURL(u));
      created.current = made;
      setUrls(next);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  return (
    <NowFrame
      doc={doc}
      pageCount={pages.length}
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
