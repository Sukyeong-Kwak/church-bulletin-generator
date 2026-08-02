"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { formatServiceDate } from "@/lib/layout";
import { useFlowPages, withFixedPages } from "@/lib/paginate";
import { useFitScale } from "@/lib/useFitScale";
import type { BulletinDoc } from "@/lib/types";
import { PreviewGrid } from "./PreviewGrid";
import { Btn } from "./ui";

/**
 * 공유 링크로 들어온 사람에게 보여주는 주보.
 * 로그인 없이 열리며 보기와 이미지 받기만 가능하다.
 */
export function SharedBulletin({ doc }: { doc: BulletinDoc }) {
  const { pages: flowPages, measurer } = useFlowPages(doc);
  const pages = useMemo(() => withFixedPages(flowPages), [flowPages]);

  const [urls, setUrls] = useState<{ background?: string; cover?: string; logo?: string }>({});
  const [busy, setBusy] = useState(false);
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

  const downloadImages = async () => {
    if (!doc.imageKeys?.length) return;
    setBusy(true);
    try {
      const backend = getBackend();
      const blobs: Blob[] = [];
      for (const k of doc.imageKeys) {
        const blob = await backend.getImage(k);
        if (blob) blobs.push(blob);
      }
      const fmt = doc.exportFormat ?? "jpg";
      if (blobs.length === 1) saveBlob(blobs[0], fileNameFor(doc.serviceDate, 0, fmt));
      else await saveZip(blobs, doc.serviceDate, fmt);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <header
        className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2.5"
        style={{ borderColor: "var(--ui-border)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/the-piece.svg" alt="" width={22} height={22} />
        <span className="text-[14px] font-bold">{formatServiceDate(doc.serviceDate)} 주보</span>
        <span className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
          {pages.length}페이지
        </span>

        <div className="ml-auto flex items-center gap-2">
          {!!doc.imageKeys?.length && (
            <Btn size="sm" variant="primary" disabled={busy} onClick={downloadImages}>
              {busy ? "준비 중…" : "이미지 받기"}
            </Btn>
          )}
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
        </div>
      </header>

      <div className="flex-1 p-4">
        <PreviewGrid doc={doc} pages={pages} urls={urls} scale={zoom} />
      </div>

      {measurer}
    </div>
  );
}
