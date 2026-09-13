"use client";

import { Fragment, memo, type CSSProperties } from "react";
import { Txt } from "./Txt";
import { bracketTitle } from "@/lib/layout";
import { SERMON_HEADING } from "@/lib/settings";
import type { AdBlock, FlowBlock, ScheduleBlock, SermonBlock, Theme } from "@/lib/types";

interface Props {
  block: FlowBlock;
  theme: Theme;
}

/**
 * 블록 하나를 렌더. 제목과 본문은 한 덩어리로 움직이며 페이지 경계에서 쪼개지지 않는다.
 *
 * 고친 블록 하나만 다시 그린다. 조판은 블록을 하나하나 몰래 그려 높이를 재는데,
 * 그냥 두면 광고 한 줄을 고칠 때마다 스무 개짜리 목록을 전부 다시 그리고 전부 다시 잰다.
 */
export const FlowBlockView = memo(function FlowBlockView({ block, theme }: Props) {
  switch (block.kind) {
    case "ad":
      return <AdBlockView block={block} theme={theme} />;
    case "schedule":
      return <ScheduleBlockView block={block} theme={theme} />;
    case "sermon":
      return <SermonBlockView block={block} theme={theme} />;
  }
});

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

/** 날짜 칸과 행사명 칸 사이 — 제목 글자 두어 자 폭 */
const SCHEDULE_GAP = 24;

/**
 * 주요일정은 두 칸으로 세운다.
 *
 * 한 줄로 이어 가운데에 두면 줄마다 길이가 달라 왼쪽 끝이 들쭉날쭉해진다.
 * 예배 안내와 같은 방식 — 가운데 거터를 기준으로 왼 칸은 오른쪽, 오른 칸은 왼쪽으로
 * 붙여 두 칸이 세로로 나란히 선다. 어느 칸에 날짜가 오는지는 원문의 차례를 따른다.
 */
function ScheduleBlockView({ block, theme }: { block: ScheduleBlock; theme: Theme }) {
  // 날짜가 한 줄도 없으면 나눌 칸이 없다 — 예전처럼 한 줄로 둔다
  const twoCols = block.items.some((it) => it.date.trim());
  // 정렬을 직접 고른 사람이 있으면 그 뜻을 덮지 않는다
  const gutter = block.itemStyle?.align === undefined;

  return (
    <div style={wrap}>
      {block.heading ? (
        <Txt role="scheduleHeading" theme={theme} override={block.headingStyle}>
          {bracketTitle(block.heading)}
        </Txt>
      ) : null}

      {twoCols ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto",
            justifyContent: "center",
            columnGap: SCHEDULE_GAP,
            alignItems: "start",
          }}
        >
          {block.items.map((it) => {
            const [left, right] = block.dateFirst ? [it.date, it.name] : [it.name, it.date];
            return (
              <Fragment key={it.id}>
                <Txt
                  role="scheduleItem"
                  theme={theme}
                  override={block.itemStyle}
                  style={gutter ? { textAlign: "right" } : undefined}
                >
                  {left}
                </Txt>
                <Txt
                  role="scheduleItem"
                  theme={theme}
                  override={block.itemStyle}
                  style={gutter ? { textAlign: "left" } : undefined}
                >
                  {right}
                </Txt>
              </Fragment>
            );
          })}
        </div>
      ) : (
        block.items.map((it) => (
          <Txt key={it.id} role="scheduleItem" theme={theme} override={block.itemStyle}>
            {it.name}
          </Txt>
        ))
      )}
    </div>
  );
}

function SermonBlockView({ block, theme }: { block: SermonBlock; theme: Theme }) {
  return (
    <div style={wrap}>
      {/* 소제목은 고정값이다. 옛 저장본에 그 주 제목이 박혀 있어도 이 자리에는 늘 같은 말이 온다. */}
      <Txt role="sermonHeading" theme={theme} override={block.headingStyle}>
        {SERMON_HEADING}
      </Txt>
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
      return SERMON_HEADING;
  }
}
