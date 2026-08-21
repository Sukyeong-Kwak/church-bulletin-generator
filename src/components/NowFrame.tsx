"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PIECES } from "@/lib/brand";
import type { BulletinDoc } from "@/lib/types";
import { Btn } from "./ui";

interface Props {
  doc: BulletinDoc;
  /** 몇 쪽짜리인지 — 표지에 한 줄로 적는다 */
  pageCount: number;
  /** 머리에 놓을 것 (저장 버튼·확대 조절기) */
  action?: ReactNode;
  /** 날짜 줄 아래에 놓을 것 — 지난 주보로 넘어가는 자리 */
  nav?: ReactNode;
  /** 아래 마무리에 놓을 것 */
  footerAction?: ReactNode;
  /** 주보가 놓이는 자리 */
  children: ReactNode;
}

/**
 * QR로 들어온 사람이 보는 화면의 틀.
 *
 * 주보를 그리는 방법은 두 가지다 — 올릴 때 만들어 둔 이미지를 얹거나, 화면에서 다시 그리거나.
 * 어느 쪽으로 뜨든 사람이 보는 것은 같은 주보이므로, 머리띠·마무리는 여기 한 곳에 두고
 * 가운데 자리만 각자 채우게 한다. 한쪽만 예뻐지는 일이 없도록.
 *
 * 틀은 여기까지다. 날짜도 설교 제목도 화면이 따로 크게 적지 않는다 — 바로 아래 표지 그림에
 * 이미 인쇄되어 있고, 그 그림이 이 교회의 것이다. 화면이 그 앞을 가리지 않게 한다.
 */
export function NowFrame({ doc, pageCount, action, nav, footerAction, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement | null>(null);
  /** 얼마나 내려왔는지 (0~100). 머리띠의 네 조각이 그만큼 채워진다. */
  const [read, setRead] = useState(0);

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
          {action && <div className="ml-auto">{action}</div>}
        </header>
      </div>

      {/*
        표지 그림 위에 놓는 한 줄. 그림에도 날짜가 찍혀 있지만 그건 그림이라 읽어주지 못하고,
        몇 쪽짜리인지는 어디에도 없다 — 그 두 가지만 조용히 적는다.
      */}
      <p
        className="mx-auto w-full max-w-[720px] px-3 pb-2 pt-3 text-[11.5px]"
        style={{ color: "var(--ui-subtle)" }}
      >
        {longDate(doc.serviceDate)} · 모두 {pageCount}쪽
      </p>

      {/* 지난 주보로 넘어가는 줄. 볼 것이 이번 주뿐이면 아무것도 놓이지 않는다. */}
      {nav}

      <div className="mx-auto w-full max-w-[720px] px-3 pb-10">
        {children}

        {/* 다 본 사람에게 — 예배가 끝나고 저장해 가는 자리 */}
        <div className="mt-7 flex items-center justify-center gap-2">
          {footerAction}
          <Btn onClick={toTop}>맨 위로</Btn>
        </div>

        {doc.church.pastorLine && (
          <p className="mt-6 text-center text-[12px]" style={{ color: "var(--ui-muted)" }}>
            {doc.church.pastorLine}
          </p>
        )}

        <div className="mt-5 flex justify-center gap-1.5">
          {PIECES.map((c) => (
            <span key={c} style={{ background: c, width: 6, height: 6, borderRadius: 2 }} />
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
