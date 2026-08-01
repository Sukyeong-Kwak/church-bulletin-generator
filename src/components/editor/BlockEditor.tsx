"use client";

import { useState } from "react";
import { FontSelect, Inspector } from "../Inspector";
import { Btn, Hint } from "../ui";
import { blockLabel } from "../FlowBlocks";
import { DEFAULT_STYLES, FONT_SIZE, resolveStyle, type Role } from "@/lib/layout";
import { moveBlock, newId, updateBlock } from "@/lib/store";
import type {
  AdBlock,
  BulletinDoc,
  FlowBlock,
  ScheduleBlock,
  SermonBlock,
  TextStyle,
  Theme,
} from "@/lib/types";

interface Props {
  doc: BulletinDoc;
  setDoc: (updater: (prev: BulletinDoc) => BulletinDoc) => void;
}

export function BlockEditor({ doc, setDoc }: Props) {
  const [openStyle, setOpenStyle] = useState<string | null>(null);

  const patch = (id: string, fn: (b: FlowBlock) => FlowBlock) =>
    setDoc((d) => ({ ...d, blocks: updateBlock(d.blocks, id, fn) }));

  const move = (id: string, dir: -1 | 1) =>
    setDoc((d) => ({ ...d, blocks: moveBlock(d.blocks, id, dir) }));

  const remove = (id: string) =>
    setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));

  /** 기본 위치에서 세로로 밀어 놓는다. 0이면 지워서 기본값으로 되돌린다. */
  const nudge = (id: string, offsetY: number) =>
    patch(id, (b) => {
      const next = { ...b } as FlowBlock;
      if (offsetY === 0) delete next.offsetY;
      else next.offsetY = offsetY;
      return next;
    });

  const addAd = () =>
    setDoc((d) => {
      const ad: AdBlock = { id: newId("ad"), kind: "ad", title: "", body: "" };
      const firstNonAd = d.blocks.findIndex((b) => b.kind !== "ad");
      const at = firstNonAd < 0 ? d.blocks.length : firstNonAd;
      return { ...d, blocks: [...d.blocks.slice(0, at), ad, ...d.blocks.slice(at)] };
    });

  return (
    <div className="flex flex-col gap-2">
      {doc.blocks.map((b, i) => {
        const styleOpen = openStyle === b.id;
        return (
          <div
            key={b.id}
            className="rounded-xl border bg-white"
            style={{ borderColor: "var(--ui-border)" }}
          >
            <div className="flex items-center gap-1 border-b px-2.5 py-1.5" style={{ borderColor: "var(--ui-border)" }}>
              <span className="mr-auto truncate text-[12px] font-bold">
                {i + 1}. {blockLabel(b)}
              </span>
              <Btn size="sm" variant="ghost" onClick={() => move(b.id, -1)} disabled={i === 0} title="위로">
                ↑
              </Btn>
              <Btn size="sm" variant="ghost" onClick={() => move(b.id, 1)} disabled={i === doc.blocks.length - 1} title="아래로">
                ↓
              </Btn>
              <Btn
                size="sm"
                variant={styleOpen ? "primary" : "ghost"}
                onClick={() => setOpenStyle(styleOpen ? null : b.id)}
                title="정렬·폰트 크기 등 조절"
              >
                스타일
              </Btn>
              {b.kind === "ad" && (
                <Btn size="sm" variant="danger" onClick={() => remove(b.id)} title="삭제">
                  삭제
                </Btn>
              )}
            </div>

            <div className="flex flex-col gap-2 p-2.5">
              {b.kind === "ad" && <AdFields block={b} patch={patch} />}
              {b.kind === "schedule" && <ScheduleFields block={b} patch={patch} />}
              {b.kind === "sermon" && <SermonFields block={b} patch={patch} />}

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--ui-muted)" }}>
                  <input
                    type="checkbox"
                    checked={!!b.pageBreakBefore}
                    onChange={(e) =>
                      patch(b.id, (x) => ({ ...x, pageBreakBefore: e.target.checked }) as FlowBlock)
                    }
                    style={{ width: "auto" }}
                  />
                  이 블록 앞에서 페이지 나누기
                </label>

                <NudgeY offsetY={b.offsetY ?? 0} onChange={(v) => nudge(b.id, v)} />
              </div>

              <QuickType block={b} theme={doc.theme} patch={patch} />

              {styleOpen && <StylePanels block={b} doc={doc} patch={patch} />}
            </div>
          </div>
        );
      })}

      <Btn onClick={addAd}>+ 광고 직접 추가</Btn>
      <Hint>제목과 본문은 한 덩어리로 움직이며 페이지 경계에서 잘리지 않습니다.</Hint>
    </div>
  );
}

/** 한 번 누를 때 움직이는 거리 — 891×1260 캔버스에서 눈에 딱 보일 만큼 */
const NUDGE_STEP = 8;
const NUDGE_LIMIT = 400;

/**
 * 블록을 기본 위치에서 위·아래로 밀어 놓는다.
 * 자리는 그대로 두고 그려지는 위치만 옮기므로 페이지 나눔은 그대로다.
 */
function NudgeY({ offsetY, onChange }: { offsetY: number; onChange: (v: number) => void }) {
  const step = (dir: -1 | 1) =>
    onChange(clamp(offsetY + dir * NUDGE_STEP, -NUDGE_LIMIT, NUDGE_LIMIT));

  return (
    <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--ui-muted)" }}>
      <span>세로 위치</span>
      <Btn size="sm" variant="ghost" onClick={() => step(-1)} title={`위로 ${NUDGE_STEP}px`}>
        ↑
      </Btn>
      <Btn size="sm" variant="ghost" onClick={() => step(1)} title={`아래로 ${NUDGE_STEP}px`}>
        ↓
      </Btn>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        {offsetY === 0 ? "기본" : `${offsetY > 0 ? "+" : ""}${offsetY}px`}
      </span>
      {offsetY !== 0 && (
        <button onClick={() => onChange(0)} title="기본 위치로">
          ↺
        </button>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 블록에서 '본문'에 해당하는 자리 — 광고는 본문, 주요일정은 항목, 본문 말씀은 본문 줄 */
function bodySlot(block: FlowBlock): {
  key: "bodyStyle" | "itemStyle" | "lineStyle";
  role: Role;
  style?: TextStyle;
} {
  switch (block.kind) {
    case "ad":
      return { key: "bodyStyle", role: "blockBody", style: block.bodyStyle };
    case "schedule":
      return { key: "itemStyle", role: "scheduleItem", style: block.itemStyle };
    case "sermon":
      return { key: "lineStyle", role: "sermonLine", style: block.lineStyle };
  }
}

/**
 * 본문 글꼴과 크기 — 가장 자주 손대는 둘이라 '스타일'을 열지 않고도 바로 바꾼다.
 * 나머지 세밀한 조절은 '스타일' 패널에 그대로 있고, 값은 같은 자리에 저장된다.
 */
function QuickType({ block, theme, patch }: { block: FlowBlock; theme: Theme; patch: Patch }) {
  const { role, style } = bodySlot(block);
  const cur = resolveStyle(role, theme, style);
  const baseSize = DEFAULT_STYLES[role].fontSize;
  const touched = style?.font !== undefined || style?.fontSize !== undefined;

  // 고칠 값은 화면에 그려진 것이 아니라 그 순간의 블록에서 읽는다 — 연달아 눌러도 쌓인다
  const edit = (change: (prev: TextStyle) => TextStyle) =>
    patch(block.id, (b) => {
      const slot = bodySlot(b);
      const next = change(slot.style ?? {});
      for (const k of Object.keys(next) as (keyof TextStyle)[]) {
        if (next[k] === undefined) delete next[k];
      }
      return { ...b, [slot.key]: Object.keys(next).length ? next : undefined } as FlowBlock;
    });

  const resize = (dir: -1 | 1) =>
    edit((prev) => ({
      ...prev,
      fontSize: clamp((prev.fontSize ?? baseSize) + dir, FONT_SIZE.min, FONT_SIZE.max),
    }));

  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px]" style={{ color: "var(--ui-muted)" }}>
      <span>글꼴</span>
      <FontSelect
        role={role}
        value={style?.font}
        current={cur.fontFamily}
        onChange={(v) => edit((prev) => ({ ...prev, font: v }))}
        // 옆 작은 버튼들과 키를 맞춘다
        style={{ width: "auto", flex: "0 1 auto", padding: "4px 8px", fontSize: 12 }}
      />

      <span className="ml-1.5">크기</span>
      <Btn size="sm" variant="ghost" onClick={() => resize(-1)} title="1px 작게">
        −
      </Btn>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{cur.fontSize}px</span>
      <Btn size="sm" variant="ghost" onClick={() => resize(1)} title="1px 크게">
        +
      </Btn>
      {touched && (
        <button
          onClick={() => edit((prev) => ({ ...prev, font: undefined, fontSize: undefined }))}
          title="기본 글꼴·크기로"
        >
          ↺
        </button>
      )}
    </div>
  );
}

type Patch = (id: string, fn: (b: FlowBlock) => FlowBlock) => void;

function AdFields({ block, patch }: { block: AdBlock; patch: Patch }) {
  return (
    <>
      <input
        type="text"
        value={block.title}
        placeholder="<제목>"
        onChange={(e) => patch(block.id, (b) => ({ ...(b as AdBlock), title: e.target.value }))}
      />
      <textarea
        rows={4}
        value={block.body}
        placeholder="본문"
        style={{ resize: "vertical" }}
        onChange={(e) => patch(block.id, (b) => ({ ...(b as AdBlock), body: e.target.value }))}
      />
    </>
  );
}

function ScheduleFields({ block, patch }: { block: ScheduleBlock; patch: Patch }) {
  const setItems = (items: ScheduleBlock["items"]) =>
    patch(block.id, (b) => ({ ...(b as ScheduleBlock), items }));

  return (
    <>
      <input
        type="text"
        value={block.heading}
        placeholder="주요일정"
        onChange={(e) => patch(block.id, (b) => ({ ...(b as ScheduleBlock), heading: e.target.value }))}
      />
      {block.items.map((it, i) => (
        <div key={it.id} className="flex gap-1.5">
          <input
            type="text"
            value={it.name}
            placeholder="행사명"
            onChange={(e) =>
              setItems(block.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
            }
          />
          <input
            type="text"
            value={it.date}
            placeholder="6월 3일(수)"
            onChange={(e) =>
              setItems(block.items.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))
            }
          />
          <Btn size="sm" variant="danger" onClick={() => setItems(block.items.filter((_, j) => j !== i))}>
            −
          </Btn>
        </div>
      ))}
      <Btn size="sm" onClick={() => setItems([...block.items, { id: newId("i"), name: "", date: "" }])}>
        + 일정 추가
      </Btn>
    </>
  );
}

function SermonFields({ block, patch }: { block: SermonBlock; patch: Patch }) {
  return (
    <>
      <input
        type="text"
        value={block.heading}
        placeholder="본문 말씀"
        onChange={(e) => patch(block.id, (b) => ({ ...(b as SermonBlock), heading: e.target.value }))}
      />
      <input
        type="text"
        value={block.title}
        placeholder="제목: 하나님의 공유적속성 지식과 지혜"
        onChange={(e) => patch(block.id, (b) => ({ ...(b as SermonBlock), title: e.target.value }))}
      />
      <input
        type="text"
        value={block.verse}
        placeholder="본문: 시 139:1-6"
        onChange={(e) => patch(block.id, (b) => ({ ...(b as SermonBlock), verse: e.target.value }))}
      />
    </>
  );
}

function StylePanels({
  block,
  doc,
  patch,
}: {
  block: FlowBlock;
  doc: BulletinDoc;
  patch: Patch;
}) {
  const set = (key: string, v: TextStyle | undefined) =>
    patch(block.id, (b) => ({ ...b, [key]: v }) as FlowBlock);

  if (block.kind === "ad") {
    return (
      <div className="flex flex-col gap-2">
        <Inspector label="제목" role="blockTitle" theme={doc.theme} value={block.titleStyle} onChange={(v) => set("titleStyle", v)} />
        <Inspector label="본문" role="blockBody" theme={doc.theme} value={block.bodyStyle} onChange={(v) => set("bodyStyle", v)} />
      </div>
    );
  }
  if (block.kind === "schedule") {
    return (
      <div className="flex flex-col gap-2">
        <Inspector label="소제목" role="scheduleHeading" theme={doc.theme} value={block.headingStyle} onChange={(v) => set("headingStyle", v)} />
        <Inspector label="일정 항목" role="scheduleItem" theme={doc.theme} value={block.itemStyle} onChange={(v) => set("itemStyle", v)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Inspector label="제목" role="sermonHeading" theme={doc.theme} value={block.headingStyle} onChange={(v) => set("headingStyle", v)} />
      <Inspector label="본문 줄" role="sermonLine" theme={doc.theme} value={block.lineStyle} onChange={(v) => set("lineStyle", v)} />
    </div>
  );
}
