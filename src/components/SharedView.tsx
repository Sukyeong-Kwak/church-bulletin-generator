"use client";

import { useEffect, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { CANVAS, formatServiceDate } from "@/lib/layout";
import type { BulletinDoc } from "@/lib/types";
import { SharedBulletin } from "./SharedBulletin";
import { Btn } from "./ui";

/** 로고를 이루는 네 조각의 색 */
const PIECES = ["#41508F", "#4FA391", "#F0A94C", "#E56B4E"];

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
    <div className="min-h-full" style={{ background: "#eff1f4" }}>
      {/* 로고의 네 조각을 실오라기처럼 얹어 둔다 — 맨 위 한 줄만으로 어느 주보인지 알아본다 */}
      <div className="sticky top-0 z-20">
        <div className="flex h-[3px]">
          {PIECES.map((c) => (
            <div key={c} style={{ background: c, flex: 1 }} />
          ))}
        </div>
        <header
          className="flex items-center gap-2 border-b px-3.5 py-2.5"
          style={{
            borderColor: "rgba(0,0,0,0.06)",
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/the-piece.svg" alt="" width={20} height={20} />
          <span className="text-[13px] font-bold tracking-tight">
            THE PIECE <span style={{ color: "var(--ui-muted)" }}>주보</span>
          </span>
          <Btn size="sm" variant="primary" disabled={busy} onClick={download} className="ml-auto">
            {busy ? "준비 중…" : "저장"}
          </Btn>
        </header>
      </div>

      <div className="mx-auto w-full max-w-[720px] px-3 pb-10">
        {/* 표지 위에 날짜를 한 번 크게 적어 준다. 지난주 것을 열어둔 채 헷갈리지 않게. */}
        <div className="py-7 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/the-piece.svg" alt="" width={46} height={46} className="mx-auto" />
          <h1 className="mt-3 text-[19px] font-bold tracking-tight">
            {formatServiceDate(doc.serviceDate)}
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--ui-muted)" }}>
            THE PIECE 주보 · {keys.length}쪽
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {keys.map((key, i) => (
            <figure
              key={key}
              className="relative overflow-hidden rounded-2xl bg-white"
              style={{
                // 이미지가 도착하기 전에도 자리를 잡아 둔다. 안 그러면 한 장씩 뜰 때마다 화면이 튄다.
                aspectRatio: `${CANVAS.w} / ${CANVAS.h}`,
                boxShadow: "0 1px 3px rgba(16,24,40,0.08), 0 8px 24px rgba(16,24,40,0.06)",
              }}
            >
              {urls[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls[i]}
                  alt={`${i + 1}쪽`}
                  className="block h-full w-full"
                  style={{ objectFit: "contain" }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-[12px]" style={{ color: "#b9bec7" }}>
                    {urls[i] === null ? `${i + 1}쪽을 불러오지 못했습니다` : `${i + 1}쪽 불러오는 중…`}
                  </span>
                </div>
              )}

              <figcaption
                className="absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(22,24,29,0.55)", color: "#fff" }}
              >
                {i + 1} / {keys.length}
              </figcaption>
            </figure>
          ))}
        </div>

        <p
          className="mt-8 text-center text-[11px] leading-relaxed"
          style={{ color: "var(--ui-muted)" }}
        >
          우리는 하나님의 퍼즐의 한 조각
          <br />
          THE PIECE 주보
        </p>
      </div>
    </div>
  );
}
