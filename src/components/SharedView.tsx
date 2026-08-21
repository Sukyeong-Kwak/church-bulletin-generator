"use client";

import { useEffect, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { imagePairUrls } from "@/lib/backend/images";
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
 * 표를 새로 끊어 오는 횟수의 끝.
 *
 * 만료라면 한 번이면 되고, 두 번은 아주 오래 열어둔 경우다. 그런데 만료가 아니라 정말로 없는
 * 파일이라면 새 표로도 마찬가지라, 끝을 두지 않으면 오류와 재발급이 서로를 부르며 맞물려 돈다.
 */
const MAX_RESIGN = 3;

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
   * 자리를 맞춰 두어야 한 장이 실패했을 때 그 뒤가 통째로 한 칸씩 당겨지지 않는다.
   */
  const [urls, setUrls] = useState<(string | null | undefined)[]>([]);

  /**
   * 주소를 다시 받아야 할 때 올린다.
   *
   * 이 화면의 주소는 한 시간짜리 표다. 그런데 첫 장 말고는 굴려서 눈에 들어올 때 비로소
   * 받으러 가므로(loading="lazy"), 주보를 열어두고 예배를 본 뒤 아래쪽을 넘기면
   * 그때 쓰는 표가 이미 만료돼 있다 — 그 장만 영영 빈칸으로 남는다.
   * 그림이 안 열렸다고 알려오면 표를 새로 끊어 온다.
   */
  const [attempt, setAttempt] = useState(0);
  /** 한 벌에서 여러 장이 한꺼번에 알려온다 — 그 한 벌에 대해서는 한 번만 받아 온다 */
  const asking = useRef(false);

  const resign = () => {
    if (asking.current || attempt >= MAX_RESIGN) return;
    asking.current = true;
    setAttempt((n) => n + 1);
  };

  /** 지금 화면이 쓰고 있는 주소 한 벌 — 새것이 자리 잡은 뒤에 옛것을 거둔다 */
  const held = useRef<(string | null)[]>([]);

  useEffect(() => {
    let alive = true;
    const backend = getBackend();

    (async () => {
      /*
       * 주소만 받아 <img>에 걸고 실제 내려받기는 브라우저에 맡긴다.
       *
       * 예전에는 파일을 한 장씩 차례로 받아 blob 주소를 만들었다. 그러면 앞 장이 다 올 때까지
       * 뒷장은 시작조차 못 하고, 브라우저 캐시에도 남지 않아 화면을 새로 열 때마다 처음부터 받았다.
       * 주소로 걸어두면 여러 장이 한꺼번에 내려오고, 위에서부터 차례로 그려지고, 다음에 열 때는 캐시가 받는다.
       *
       * 원본이 아니라 화면용 축소본을 받는다 — 폰 화면 한 장에 인쇄 화질은 필요 없다.
       */
      const next = await imagePairUrls(backend, keys);
      if (!alive) {
        backend.releaseUrls(next);
        return;
      }
      const previous = held.current;
      held.current = next;
      setUrls(next);
      asking.current = false;
      // 표를 새로 끊는 길로 들어왔을 때, 옛 주소를 먼저 거두면 그 사이 모든 장이 빈칸이 된다
      backend.releaseUrls(previous);
    })();

    return () => {
      alive = false;
    };
    // 주소 목록이 같으면 다시 받지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join("|"), attempt]);

  // 화면을 떠날 때 마지막 한 벌을 거둔다
  useEffect(() => {
    return () => {
      getBackend().releaseUrls(held.current);
      held.current = [];
    };
  }, []);

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
              /*
               * 첫 장은 열자마자 보이는 자리라 먼저 받고, 나머지는 굴려 내려올 때 받는다.
               * 여덟 장짜리 주보에서 첫 장이 나머지 일곱 장과 회선을 나눠 쓰지 않게 된다.
               */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urls[i]}
                // 화면에 쪽 번호를 적지는 않지만, 소리로 듣는 사람에게는 순서가 유일한 길잡이다
                alt={`주보 ${i + 1}쪽`}
                className="block h-full w-full"
                style={{ objectFit: "contain" }}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "low"}
                decoding="async"
                onError={resign}
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
