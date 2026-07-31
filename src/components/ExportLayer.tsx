"use client";

import type { CSSProperties } from "react";
import { BulletinPage } from "./BulletinPage";
import type { BulletinDoc, LaidOutPage } from "@/lib/types";

interface Props {
  doc: BulletinDoc;
  pages: LaidOutPage[];
  urls: { background?: string; cover?: string; logo?: string };
  registerRef: (index: number, el: HTMLDivElement | null) => void;
}

/**
 * 내보내기용 페이지 레이어.
 *
 * 화면에 보이는 미리보기는 축소되거나 일부만 보여줄 수 있지만,
 * 내보내기는 항상 전체 페이지를 원본 크기(891×1260) 그대로 캡처해야 한다.
 * 그래서 표시와 분리해 화면 밖에 실제 크기로 항상 그려둔다.
 */
export function ExportLayer({ doc, pages, urls, registerRef }: Props) {
  return (
    <div aria-hidden style={layer}>
      {pages.map((page) => (
        <div key={page.index} ref={(el) => registerRef(page.index, el)}>
          <BulletinPage
            doc={doc}
            page={page}
            backgroundUrl={urls.background}
            coverUrl={urls.cover}
            logoUrl={urls.logo}
          />
        </div>
      ))}
    </div>
  );
}

const layer: CSSProperties = {
  position: "fixed",
  left: -100000,
  top: 0,
  pointerEvents: "none",
  zIndex: -1,
};
