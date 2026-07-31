"use client";

import { useState } from "react";
import { Inspector } from "../Inspector";
import { Btn, Hint } from "../ui";
import { blockLabel } from "../FlowBlocks";
import { moveBlock, newId, updateBlock } from "@/lib/store";
import type { AdBlock, BulletinDoc, FlowBlock, ScheduleBlock, SermonBlock, TextStyle } from "@/lib/types";

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
