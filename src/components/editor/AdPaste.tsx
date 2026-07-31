"use client";

import { useEffect, useState } from "react";
import { useAdSplit } from "@/lib/ai/useAdSplit";
import {
  KIND_LABEL,
  parseScheduleItems,
  parseSermon,
  stripBrackets,
  summarize,
  type ParsedBlock,
} from "@/lib/parseAds";
import { newId } from "@/lib/store";
import type { FlowBlock } from "@/lib/types";
import { Btn, Hint } from "../ui";

interface Props {
  onApply: (blocks: FlowBlock[], mode: "replace" | "append") => void;
  onClose: () => void;
}

/**
 * 광고 붙여넣기.
 * 목사님이 구글 문서로 올린 광고 전문을 통째로 붙여넣으면 블록으로 자동 변환한다.
 * 붙여넣고 잠시 기다리면 AI(Google AI Studio)가 제목과 내용을 갈라주고,
 * AI를 못 쓰는 상황이면 규칙 방식 결과가 그대로 남는다.
 * 원문에 섞여 온 주요일정과 본문 말씀도 함께 가려내 제자리에 넣는다.
 */
export function AdPaste({ onApply, onClose }: Props) {
  const [text, setText] = useState("");
  const { blocks, source, note, status, error, retry } = useAdSplit(text);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toBlocks = (): FlowBlock[] => blocks.map(toFlowBlock);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(15,23,42,.45)" }}>
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white"
        style={{ boxShadow: "0 20px 50px rgba(0,0,0,.25)" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--ui-border)" }}>
          <div>
            <h2 className="text-[14px] font-bold">광고 붙여넣기</h2>
            <Hint>구글 문서의 광고 내용을 전부 복사해서 그대로 붙여넣으세요. 제목과 내용은 알아서 나뉩니다.</Hint>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            닫기
          </Btn>
        </div>

        {/* 대기 중임을 창 전체에서 한눈에 알 수 있게 머리말 바로 아래에 둔다 */}
        {status === "loading" && <div className="ai-bar" />}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-4">
          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
              원문
            </span>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"<주중 기도회>\n수요기도회와 목요이사야62에 적극적으로\n참여해주시기 바랍니다.\n\n<결혼>\n..."}
              className="min-h-[320px] flex-1 resize-none font-mono"
              style={{ fontSize: 12, lineHeight: 1.6 }}
            />
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
                변환 결과 {blocks.length > 0 && `(${blocks.length}개)`}
              </span>

              {status === "loading" ? (
                <span
                  className="ai-pulse flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: "#e7f5ff", color: "#1971c2" }}
                >
                  <span className="ai-spinner" />
                  AI가 나누는 중…
                </span>
              ) : (
                blocks.length > 0 && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={
                      source === "ai"
                        ? { background: "#ebfbee", color: "#2b8a3e" }
                        : { background: "#f1f3f5", color: "var(--ui-muted)" }
                    }
                  >
                    {source === "ai" ? "AI 구분" : "규칙 구분"}
                  </span>
                )
              )}

              {text.trim() !== "" && status !== "loading" && (
                <Btn size="sm" variant="ghost" onClick={retry} style={{ marginLeft: "auto" }}>
                  다시 나누기
                </Btn>
              )}
            </div>

            <div
              className="min-h-[320px] flex-1 overflow-auto rounded-lg border p-2"
              style={{
                borderColor: "var(--ui-border)",
                background: "#fafafa",
                // 아직 확정 전인 규칙 결과라는 걸 흐리기로 알린다
                opacity: status === "loading" ? 0.55 : 1,
                transition: "opacity .2s ease",
              }}
            >
              {blocks.length === 0 ? (
                status === "loading" ? (
                  <p className="ai-pulse p-3 text-[12px]" style={{ color: "var(--ui-muted)" }}>
                    AI가 제목과 내용을 나누고 있습니다…
                  </p>
                ) : (
                  <p className="p-3 text-[12px]" style={{ color: "var(--ui-muted)" }}>
                    왼쪽에 붙여넣으면 광고 블록으로 나뉜 결과가 여기에 표시됩니다.
                  </p>
                )
              ) : (
                blocks.map((p, i) => (
                  <div
                    key={i}
                    className="mb-2 rounded-lg border bg-white p-2.5"
                    style={{ borderColor: p.confident ? "var(--ui-border)" : "#ffd8a8" }}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-[12px] font-bold">
                        {p.title || <span style={{ color: "#f08c00" }}>제목 없음</span>}
                      </span>
                      {/* 광고가 아닌 것은 어느 자리로 들어가는지 알려준다 */}
                      {p.kind !== "ad" && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ background: "#e7f5ff", color: "#1971c2" }}
                        >
                          → {KIND_LABEL[p.kind]}
                        </span>
                      )}
                      {!p.confident && (
                        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#fff4e6", color: "#b45309" }}>
                          확인 필요
                        </span>
                      )}
                    </div>
                    <BlockPreview block={p} />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--ui-border)" }}>
          <div className="min-w-0">
            <Hint>
              {status === "loading"
                ? "AI가 나누는 중입니다. 잠시만 기다려 주세요 — 지금 보이는 건 임시 결과입니다."
                : summarize(blocks)}
            </Hint>
            {/* 키가 없는 건 고장이 아니라 '아직 안 켠 기능'이므로 조용히 안내한다 */}
            {error?.code === "no-key" ? (
              <Hint>AI 자동 구분은 꺼져 있습니다 (서버에 GEMINI_API_KEY 없음). 규칙 방식으로 나눴습니다.</Hint>
            ) : (
              (note || error) && (
                <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "#b45309" }}>
                  {note ?? error?.message}
                </p>
              )
            )}
          </div>
          <div className="flex gap-2">
            <Btn disabled={blocks.length === 0} onClick={() => onApply(toBlocks(), "append")}>
              뒤에 추가
            </Btn>
            <Btn variant="primary" disabled={blocks.length === 0} onClick={() => onApply(toBlocks(), "replace")}>
              광고 전체 교체
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 광고가 아닌 덩어리는 실제로 어떤 항목으로 갈리는지 보여준다 */
function BlockPreview({ block }: { block: ParsedBlock }) {
  const muted = { color: "var(--ui-muted)" };

  if (block.kind === "sermon") {
    const { title, verse } = parseSermon(block.body);
    return (
      <div className="text-[11px] leading-relaxed" style={muted}>
        <div>제목: {title || <span style={{ color: "#f08c00" }}>못 찾음</span>}</div>
        <div>본문: {verse || <span style={{ color: "#f08c00" }}>못 찾음</span>}</div>
      </div>
    );
  }

  if (block.kind === "schedule") {
    return (
      <ul className="text-[11px] leading-relaxed" style={muted}>
        {parseScheduleItems(block.body).map((it, i) => (
          <li key={i}>
            {it.name} <span style={{ color: "var(--ui-subtle)" }}>{it.date || "날짜 없음"}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-[11px] leading-relaxed" style={muted}>
      {block.body}
    </p>
  );
}

/** 나뉜 덩어리를 주보 블록으로 만든다 */
function toFlowBlock(p: ParsedBlock): FlowBlock {
  const heading = stripBrackets(p.title);

  if (p.kind === "sermon") {
    const { title, verse } = parseSermon(p.body);
    return {
      id: newId("ser"),
      kind: "sermon",
      heading: heading || "본문 말씀",
      title,
      verse,
    };
  }

  if (p.kind === "schedule") {
    return {
      id: newId("sch"),
      kind: "schedule",
      heading: heading || "주요일정",
      items: parseScheduleItems(p.body).map((it) => ({ id: newId("i"), ...it })),
    };
  }

  return { id: newId("ad"), kind: "ad", title: p.title, body: p.body };
}
