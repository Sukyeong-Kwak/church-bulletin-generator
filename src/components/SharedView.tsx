"use client";

import { useEffect, useRef, useState } from "react";
import { getBackend } from "@/lib/backend";
import { PIECES } from "@/lib/brand";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { CANVAS } from "@/lib/layout";
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

/**
 * 폰으로 보는 주보.
 *
 * 대부분 예배 직전에 한 손으로 스치듯 넘겨 본다. 그래서 버튼을 늘어놓지 않고
 * 주보 자체를 화면 폭 가득 채워 세로로 이어 놓았다. 확대는 손가락으로 벌리면 된다.
 *
 * 주보 위에는 오늘 날짜와 설교 제목만 얹은 표지 한 칸을 둔다. 지난주 것을 열어둔 채
 * 헷갈리지 않게 하려는 것이고, 그 아래로는 아무것도 덧대지 않는다 — 주인공은 주보다.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement | null>(null);
  /** 얼마나 내려왔는지 (0~100). 머리띠의 네 조각이 그만큼 채워진다. */
  const [read, setRead] = useState(0);

  const sermon = doc.blocks.find((b) => b.kind === "sermon");

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

  useEffect(() => {
    // 화면 전체가 아니라 <main>이 스크롤 통이다(body는 overflow-hidden).
    // window의 스크롤을 들어봐야 아무 일도 일어나지 않으므로 그 통을 찾아 붙는다.
    const el = findScroller(rootRef.current);
    // 잴 수 없으면 빈 회색 줄만 남는다 — 그럴 땐 네 조각을 그대로 채워 둔다
    if (!el) {
      setRead(100);
      return;
    }
    scroller.current = el;

    const measure = () => {
      const room = el.scrollHeight - el.clientHeight;
      // 내릴 것이 없으면(한 쪽짜리·큰 화면) 이미 다 본 것이다 — 네 조각을 온전히 보여준다
      setRead(room > 8 ? Math.min(100, (el.scrollTop / room) * 100) : 100);
    };

    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // 주보가 한 장씩 도착하며 문서가 길어진다 — 그때마다 다시 잰다
    const ro = new ResizeObserver(measure);
    if (rootRef.current) ro.observe(rootRef.current);

    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  /** 스크롤 통을 찾지 못한 자리에서도 버튼이 헛돌지 않게 창까지 한 번 더 시도한다 */
  const toTop = () => {
    const target = scroller.current ?? window;
    target.scrollTo({ top: 0, behavior: "smooth" });
  };

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
    <div ref={rootRef} className="min-h-full" style={{ background: "#eff1f4" }}>
      {/* 로고의 네 조각을 실오라기처럼 얹어 둔다 — 맨 위 한 줄만으로 어느 주보인지 알아본다 */}
      <div className="sticky top-0 z-20">
        {/* 그 한 줄이 곧 어디까지 봤는지이기도 하다. 다 보면 네 조각이 온전히 채워진다. */}
        <div className="relative h-[3px]" style={{ background: "#dfe3e9" }}>
          <div
            className="flex h-full"
            style={{
              clipPath: `inset(0 ${100 - read}% 0 0)`,
              transition: "clip-path 0.1s linear",
            }}
          >
            {PIECES.map((c) => (
              <div key={c} style={{ background: c, flex: 1 }} />
            ))}
          </div>
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

      {/* 표지 — 네 조각 색을 옅게 번지게 깔아, 회색 화면이 첫인상이 되지 않게 한다 */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(115% 75% at 10% 0%, rgba(65,80,143,0.17), transparent 62%),
              radial-gradient(115% 75% at 90% 4%, rgba(229,107,78,0.16), transparent 62%),
              radial-gradient(100% 65% at 50% 100%, rgba(79,163,145,0.13), transparent 72%)`,
          }}
        />
        <div className="relative mx-auto w-full max-w-[720px] px-5 pb-8 pt-9 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/the-piece.svg"
            alt=""
            width={52}
            height={52}
            className="now-rise mx-auto"
          />

          <div
            className="now-rise mt-4 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{
              background: "rgba(255,255,255,0.8)",
              color: "#41508F",
              animationDelay: "60ms",
            }}
          >
            이번 주 예배
          </div>

          <h1
            className="now-rise mt-2 text-[24px] font-bold leading-tight tracking-tight"
            style={{ animationDelay: "110ms" }}
          >
            {longDate(doc.serviceDate)}
          </h1>

          {sermon && (sermon.title || sermon.verse) && (
            <div
              className="now-rise mx-auto mt-5 max-w-[420px] rounded-2xl px-5 py-4"
              style={{
                background: "rgba(255,255,255,0.72)",
                boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
                animationDelay: "170ms",
              }}
            >
              <p
                className="text-[11px] font-semibold tracking-[0.08em]"
                style={{ color: "var(--ui-subtle)" }}
              >
                {sermon.heading || "말씀"}
              </p>
              {sermon.title && (
                <p className="mt-1.5 text-[16px] font-bold leading-snug">{sermon.title}</p>
              )}
              {sermon.verse && (
                <p className="mt-1 text-[12.5px]" style={{ color: "var(--ui-muted)" }}>
                  {sermon.verse}
                </p>
              )}
            </div>
          )}

          <div
            className="now-rise mt-7 flex flex-col items-center gap-1 text-[11px]"
            style={{ color: "var(--ui-subtle)", animationDelay: "230ms" }}
          >
            <span>아래로 넘겨 보세요 · 총 {keys.length}쪽</span>
            <svg className="now-nudge" width="13" height="13" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M6 9l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[720px] px-3 pb-10">
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
                  className="now-rise block h-full w-full"
                  style={{ objectFit: "contain" }}
                />
              ) : urls[i] === null ? (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-[12px]" style={{ color: "#b9bec7" }}>
                    이 쪽을 불러오지 못했습니다
                  </span>
                </div>
              ) : (
                <div className="now-skeleton h-full w-full" />
              )}
            </figure>
          ))}
        </div>

        {/* 다 본 사람에게 — 예배가 끝나고 저장해 가는 자리 */}
        <div className="mt-7 flex items-center justify-center gap-2">
          <Btn variant="primary" disabled={busy} onClick={download}>
            {busy ? "준비 중…" : "주보 저장하기"}
          </Btn>
          <Btn onClick={toTop}>맨 위로</Btn>
        </div>

        {doc.church.pastorLine && (
          <p className="mt-6 text-center text-[12px]" style={{ color: "var(--ui-muted)" }}>
            {doc.church.pastorLine}
          </p>
        )}

        <div className="mt-5 flex justify-center gap-1.5">
          {PIECES.map((c, i) => (
            <span
              key={c}
              className="now-rise"
              style={{
                background: c,
                width: 6,
                height: 6,
                borderRadius: 2,
                animationDelay: `${i * 90}ms`,
              }}
            />
          ))}
        </div>

        <p
          className="mt-3 text-center text-[11px] leading-relaxed"
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

/** '2026-08-03' → '2026년 8월 3일 주일' — 표지에 한 번 크게 적는 형식 */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}년 ${Number(m)}월 ${Number(d)}일 주일`;
}

/** 이 화면을 담고 있는 스크롤 통을 찾는다 */
function findScroller(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null;
  while (el) {
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}
