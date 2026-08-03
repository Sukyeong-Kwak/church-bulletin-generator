"use client";

import { useEffect, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { formatServiceDate } from "@/lib/layout";
import type { BulletinDoc } from "@/lib/types";
import { SharedBulletin } from "./SharedBulletin";
import { Btn } from "./ui";

/**
 * QR로 들어온 사람에게 보여주는 화면.
 *
 * 올릴 때 만들어 둔 페이지 이미지가 있으면 그것을 보여준다. 폰이 폰트를 내려받아
 * 조판을 다시 계산하지 않아도 되니 바로 뜨고, 인쇄물·밴드에 올린 그림과 한 픽셀도 다르지 않다.
 * 이미지가 없는 옛 주보는 예전처럼 화면에서 다시 그린다.
 */
export function SharedView({ doc }: { doc: BulletinDoc }) {
  if (doc.imageKeys?.length) return <SharedImages doc={doc} />;
  return <SharedBulletin doc={doc} />;
}

function SharedImages({ doc }: { doc: BulletinDoc }) {
  const keys = doc.imageKeys ?? [];
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const created = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    const made: string[] = [];

    (async () => {
      const backend = getBackend();
      for (const key of keys) {
        const blob = await backend.getImage(key).catch(() => undefined);
        if (!blob) continue;
        made.push(URL.createObjectURL(blob));
        // 한 장씩 받는 대로 보여준다 — 마지막 장을 기다리게 두지 않는다
        if (alive) setUrls([...made]);
      }

      if (!alive) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      created.current = made;
    })();

    return () => {
      alive = false;
      created.current.forEach((u) => URL.revokeObjectURL(u));
      created.current = [];
    };
    // 주소 목록이 같으면 다시 받지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|")]);

  const download = async () => {
    setBusy(true);
    try {
      const backend = getBackend();
      const blobs: Blob[] = [];
      for (const k of keys) {
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
    <div className="flex min-h-full flex-col" style={{ background: "#f5f6f8" }}>
      <header
        className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white px-3 py-2.5"
        style={{ borderColor: "var(--ui-border)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/the-piece.svg" alt="" width={22} height={22} />
        <span className="text-[14px] font-bold">{formatServiceDate(doc.serviceDate)} 주보</span>
        <span className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
          {keys.length}쪽
        </span>
        <Btn size="sm" variant="primary" disabled={busy} onClick={download} className="ml-auto">
          {busy ? "준비 중…" : "저장"}
        </Btn>
      </header>

      {/* 폰에서 한 손으로 넘겨 보는 화면이라 세로로 죽 이어 놓는다 */}
      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3 p-3">
        {urls.map((u, i) => (
          // 내려받은 blob 주소라 next/image가 최적화할 것이 없다
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={u}
            alt={`${i + 1}쪽`}
            className="w-full rounded-lg border bg-white"
            style={{ borderColor: "var(--ui-border)", height: "auto" }}
          />
        ))}

        {urls.length < keys.length && (
          <p className="py-6 text-center text-[12px]" style={{ color: "var(--ui-muted)" }}>
            불러오는 중… ({urls.length}/{keys.length})
          </p>
        )}
      </div>
    </div>
  );
}
