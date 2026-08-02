"use client";

import type { CSSProperties } from "react";
import { Txt } from "./Txt";
import { bracketTitle } from "@/lib/layout";
import type { AdBlock, FlowBlock, ScheduleBlock, SermonBlock, Theme } from "@/lib/types";

interface Props {
  block: FlowBlock;
  theme: Theme;
}

/** 블록 하나를 렌더. 제목과 본문은 한 덩어리로 움직이며 페이지 경계에서 쪼개지지 않는다. */
export function FlowBlockView({ block, theme }: Props) {
  switch (block.kind) {
    case "ad":
      return <AdBlockView block={block} theme={theme} />;
    case "schedule":
      return <ScheduleBlockView block={block} theme={theme} />;
    case "sermon":
      return <SermonBlockView block={block} theme={theme} />;
  }
}

function AdBlockView({ block, theme }: { block: AdBlock; theme: Theme }) {
  return (
    <div style={wrap}>
      {block.title ? (
        <Txt role="blockTitle" theme={theme} override={block.titleStyle}>
          {bracketTitle(block.title)}
        </Txt>
      ) : null}
      {block.body ? (
        <Txt role="blockBody" theme={theme} override={block.bodyStyle} preserveLines>
          {block.body}
        </Txt>
      ) : null}
    </div>
  );
}

function ScheduleBlockView({ block, theme }: { block: ScheduleBlock; theme: Theme }) {
  return (
    <div style={wrap}>
      {block.heading ? (
        <Txt role="scheduleHeading" theme={theme} override={block.headingStyle}>
          {bracketTitle(block.heading)}
        </Txt>
      ) : null}
      {block.items.map((it) => (
        <Txt key={it.id} role="scheduleItem" theme={theme} override={block.itemStyle}>
          {[it.name, it.date].filter(Boolean).join(" ")}
        </Txt>
      ))}
    </div>
  );
}

function SermonBlockView({ block, theme }: { block: SermonBlock; theme: Theme }) {
  return (
    <div style={wrap}>
      {block.heading ? (
        <Txt role="sermonHeading" theme={theme} override={block.headingStyle}>
          {block.heading}
        </Txt>
      ) : null}
      {block.title ? (
        <Txt role="sermonLine" theme={theme} override={block.lineStyle}>
          {`제목: ${block.title}`}
        </Txt>
      ) : null}
      {block.verse ? (
        <Txt role="sermonLine" theme={theme} override={block.lineStyle}>
          {`본문: ${block.verse}`}
        </Txt>
      ) : null}
    </div>
  );
}

const wrap: CSSProperties = { width: "100%" };

/** 블록 라벨 — 편집 UI에서 사용 */
export function blockLabel(block: FlowBlock): string {
  switch (block.kind) {
    case "ad":
      return block.title || block.body.split("\n")[0]?.slice(0, 16) || "빈 광고";
    case "schedule":
      return block.heading || "주요일정";
    case "sermon":
      return block.heading || "본문 말씀";
  }
}
