"use client";

import { useEffect, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { CANVAS } from "@/lib/layout";
import type { BulletinDoc } from "@/lib/types";
import { NowFrame } from "./NowFrame";
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

/**
 * 폰으로 보는 주보.
 *
 * 대부분 예배 직전에 한 손으로 스치듯 넘겨 본다. 그래서 버튼을 늘어놓지 않고
 * 주보 자체를 화면 폭 가득 채워 세로로 이어 놓았다. 확대는 손가락으로 벌리면 된다.
 */
function SharedImages({ doc }: { doc: BulletinDoc }) {
  const keys = doc.imageKeys ?? [];
  const [busy, setBusy] = useState(false);
  /**
   * 쪽수와 같은 자리에 넣는다.
   *   undefined 아직 받는 중 · null 받지 못함 · string 준비됨
   * 받은 것만 차례로 밀어 넣으면, 한 장이 실패했을 때 그 뒤가 통째로 한 칸씩 당겨져
   * 2쪽 자리에 3쪽이 앉는다.
   */
  const [urls, setUrls] = useState<(string | null | undefined)[]>([]);
  const created = useRef<string[]>([]);

  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    const slots: (string | null | undefined)[] = keys.map(() => undefined);

    (async () => {
      const backend = getBackend();
      for (let i = 0; i < keys.length; i++) {
        const blob = await backend.getImage(keys[i]).catch(() => undefined);
        if (blob) {
          const url = URL.createObjectURL(blob);
          made.push(url);
          slots[i] = url;
        } else {
          slots[i] = null;
        }
        // 한 장씩 받는 대로 보여준다 — 마지막 장을 기다리게 두지 않는다
        if (alive) setUrls([...slots]);
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
    <NowFrame
      doc={doc}
      pageCount={keys.length}
      action={
        <Btn size="sm" variant="primary" disabled={busy} onClick={download}>
          {busy ? "준비 중…" : "저장"}
        </Btn>
      }
      footerAction={
        <Btn variant="primary" disabled={busy} onClick={download}>
          {busy ? "준비 중…" : "주보 저장하기"}
        </Btn>
      }
    >
      <div className="flex flex-col gap-3">
        {keys.map((key, i) => (
          <figure
            key={key}
            className="relative overflow-hidden rounded-2xl bg-white"
            style={{
              // 이미지가 도착하기 전에도 자리를 잡아 둔다. 안 그러면 한 장씩 뜰 때마다 화면이 튄다.
              aspectRatio: `${CANVAS.w} / ${CANVAS.h}`,
              boxShadow: "0 1px 3px rgba(16,24,40,0.08), 0 10px 28px rgba(16,24,40,0.07)",
            }}
          >
            {urls[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[i]}
                // 화면에 쪽 번호를 적지는 않지만, 소리로 듣는 사람에게는 순서가 유일한 길잡이다
                alt={`주보 ${i + 1}쪽`}
                className="block h-full w-full"
                style={{ objectFit: "contain" }}
              />
            ) : urls[i] === null ? (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
                  이 쪽을 불러오지 못했습니다
                </span>
              </div>
            ) : (
              <div className="now-skeleton h-full w-full" />
            )}
          </figure>
        ))}
      </div>
    </NowFrame>
  );
}
