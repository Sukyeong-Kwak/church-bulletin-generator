"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { FlowBlockView } from "@/components/FlowBlocks";
import { Txt } from "@/components/Txt";
import { BLOCK_GAP, CONTENT, HEADER_GAP } from "./layout";
import type { BulletinDoc, FlowBlock, LaidOutPage } from "./types";

interface WorkingPage {
  blocks: FlowBlock[];
  used: number;
  hasHeader: boolean;
}

/**
 * 블록 원자성을 지키는 그리디 페이지 분할.
 * 제목과 본문은 한 덩어리이므로 페이지 경계에서 절대 쪼개지지 않는다.
 * 광고가 처음 등장하는 페이지에만 '청년교구 소식' 헤더 높이를 얹는다.
 */
export function paginate(
  blocks: FlowBlock[],
  heights: Record<string, number>,
  headerHeight: number,
  avail: number = CONTENT.h,
): LaidOutPage[] {
  const h = (b: FlowBlock) => heights[b.id] ?? 0;
  const pages: WorkingPage[] = [];
  let cur: WorkingPage | null = null;

  const start = (b: FlowBlock): WorkingPage => {
    const withHeader = b.kind === "ad";
    return {
      blocks: [b],
      used: (withHeader ? headerHeight + HEADER_GAP : 0) + h(b),
      hasHeader: withHeader,
    };
  };

  for (const b of blocks) {
    if (!cur) {
      cur = start(b);
      continue;
    }
    if (b.pageBreakBefore) {
      pages.push(cur);
      cur = start(b);
      continue;
    }

    const needHeader = b.kind === "ad" && !cur.hasHeader;
    const extra = needHeader ? headerHeight + HEADER_GAP : 0;
    const next = cur.used + extra + BLOCK_GAP + h(b);

    if (next > avail) {
      pages.push(cur);
      cur = start(b);
    } else {
      cur.blocks.push(b);
      cur.used = next;
      if (needHeader) cur.hasHeader = true;
    }
  }
  if (cur) pages.push(cur);

  return pages.map((p, i) => ({
    index: i,
    kind: "flow" as const,
    blocks: p.blocks,
    showAdsHeader: p.hasHeader,
    // 한 블록이 페이지보다 커서 어쩔 수 없이 넘친 경우
    overflow: p.used > avail,
  }));
}

/** 내용이 비어 있는 블록은 페이지에 넣지 않는다 (빈 페이지가 생기지 않도록) */
export function isRenderable(b: FlowBlock): boolean {
  switch (b.kind) {
    case "ad":
      return Boolean(b.title.trim() || b.body.trim());
    case "schedule":
      return b.items.some((i) => i.name.trim() || i.date.trim());
    case "sermon":
      return Boolean(b.title.trim() || b.verse.trim());
  }
}

/** 고정 페이지(①표지 ②청년부 일정)를 앞에 붙이고 페이지 번호를 매긴다 */
export function withFixedPages(flow: LaidOutPage[]): LaidOutPage[] {
  const fixed: LaidOutPage[] = [
    { index: 0, kind: "cover", blocks: [], showAdsHeader: false, overflow: false },
    { index: 1, kind: "worship", blocks: [], showAdsHeader: false, overflow: false },
  ];
  return [...fixed, ...flow].map((p, i) => ({ ...p, index: i }));
}

/**
 * 실제 렌더 높이를 재서 페이지를 나눈다.
 * 화면 밖 숨은 컨테이너에 카드 안쪽 폭과 동일한 조건으로 그린 뒤 측정하므로
 * 한글 줄바꿈까지 그대로 반영된다. 폰트 로딩이 끝난 뒤 측정한다.
 */
export function useFlowPages(doc: BulletinDoc): {
  pages: LaidOutPage[];
  measurer: ReactNode;
  measuring: boolean;
} {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [headerH, setHeaderH] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);

  const refs = useRef(new Map<string, HTMLDivElement | null>());
  const headerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) {
      fonts.ready.then(() => {
        if (alive) setFontsReady(true);
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 폰트 API가 없는 환경에서 즉시 측정을 시작한다
      setFontsReady(true);
    }
    return () => {
      alive = false;
    };
  }, []);

  const blocks = useMemo(() => doc.blocks.filter(isRenderable), [doc.blocks]);

  // 블록 내용이나 테마가 바뀌면 다시 잰다
  const key = useMemo(() => JSON.stringify({ b: blocks, t: doc.theme }), [blocks, doc.theme]);

  // DOM에 실제로 그려진 높이를 읽어 상태로 되돌리는 과정이라 effect가 아니면 알 수 없다.
  // 값이 같으면 이전 상태를 그대로 반환해 재렌더가 반복되지 않게 막는다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    refs.current.forEach((el, id) => {
      if (el) next[id] = el.getBoundingClientRect().height;
    });
    setHeights((prev) => (sameHeights(prev, next) ? prev : next));

    const hh = headerRef.current?.getBoundingClientRect().height ?? 0;
    setHeaderH((prev) => (Math.abs(prev - hh) < 0.5 ? prev : hh));
  }, [key, fontsReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const pages = useMemo(
    () => paginate(blocks, heights, headerH),
    [blocks, heights, headerH],
  );

  const measuring = blocks.length > 0 && blocks.some((b) => heights[b.id] === undefined);

  const measurer = (
    <div aria-hidden style={measurerStyle}>
      <div ref={headerRef}>
        <Txt role="adsHeader" theme={doc.theme}>
          청년교구 소식
        </Txt>
      </div>
      {blocks.map((b) => (
        <div
          key={b.id}
          ref={(el) => {
            refs.current.set(b.id, el);
          }}
        >
          <FlowBlockView block={b} theme={doc.theme} />
        </div>
      ))}
    </div>
  );

  return { pages, measurer, measuring };
}

function sameHeights(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => b[k] !== undefined && Math.abs(a[k] - b[k]) < 0.5);
}

const measurerStyle: CSSProperties = {
  position: "fixed",
  left: -100000,
  top: 0,
  width: CONTENT.w,
  visibility: "hidden",
  pointerEvents: "none",
  zIndex: -1,
};
