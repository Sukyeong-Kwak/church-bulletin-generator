"use client";

import { DEFAULT_STYLES, type Role } from "@/lib/layout";
import { resizeBodies } from "@/lib/blockStyle";
import type { BulletinDoc, LaidOutPage } from "@/lib/types";
import { Btn } from "../ui";

/**
 * 넘침 알림 — 그리고 그 자리에서 고치는 길.
 *
 * 예전에는 "폰트 크기를 줄이거나 블록을 나눠주세요"라고만 적어 두었다. 무엇을 해야 하는지는
 * 알려주지만, 그러려면 왼쪽 목록에서 어느 블록이 넘친 것인지 눈으로 찾아 그 블록의 −를
 * 몇 번 눌러야 한다. 진단만 있고 처방이 없는 자리였다.
 *
 * 넘친 쪽에 앉은 블록은 하나뿐이다 — 조판(paginate)은 들어가지 않으면 새 쪽을 여는데,
 * 그러고도 넘쳤다는 것은 그 블록 하나가 한 쪽보다 크다는 뜻이기 때문이다.
 * 그래서 '넘친 쪽의 블록들'을 그대로 집어 한 번에 줄여주면 된다.
 */
export function OverflowNotice({
  setDoc,
  pages,
}: {
  setDoc: (updater: (prev: BulletinDoc) => BulletinDoc) => void;
  pages: LaidOutPage[];
}) {
  const over = pages.filter((p) => p.overflow);
  if (over.length === 0) return null;

  const ids = new Set(over.flatMap((p) => p.blocks.map((b) => b.id)));

  const shrink = () =>
    setDoc((d) => ({
      ...d,
      // 한 번에 1px 씩. 한 번 눌러 딱 들어가면 그보다 더 줄일 까닭이 없고,
      // 모자라면 다시 누르면 된다 — 얼마나 줄어들지 눈으로 보면서 정하는 편이 낫다
      blocks: resizeBodies(d.blocks, ids, -1, baseSizeOf),
    }));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="rounded px-2 py-0.5 text-[11px] font-semibold"
        style={{ background: "#fff4e6", color: "#b45309" }}
      >
        {over.length}개 페이지에서 내용이 넘칩니다
      </span>
      <Btn
        size="sm"
        onClick={shrink}
        title="넘친 페이지에 있는 블록의 본문 글자를 1px 줄입니다. 들어갈 때까지 여러 번 누르세요."
      >
        글자 1px 줄이기
      </Btn>
    </div>
  );
}

/** 아직 손대지 않은 블록은 그 자리의 기본 크기에서 출발한다 (테마 배율은 곱하지 않는다) */
function baseSizeOf(role: Role): number {
  return DEFAULT_STYLES[role].fontSize;
}
