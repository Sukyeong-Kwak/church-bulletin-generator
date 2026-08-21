"use client";

import { useEffect, useState } from "react";
import { useAdSplit } from "@/lib/ai/useAdSplit";
import {
  KIND_LABEL,
  flowBody,
  parseScheduleItems,
  parseSermon,
  stripBrackets,
  summarize,
  type ParsedBlock,
} from "@/lib/parseAds";
import { SERMON_HEADING } from "@/lib/settings";
import { newId } from "@/lib/store";
import type { FlowBlock } from "@/lib/types";
import { usePopup } from "../Popup";
import { Btn, Hint } from "../ui";

interface Props {
  onApply: (blocks: FlowBlock[], mode: "replace" | "append") => void;
  onClose: () => void;
}

/** AI가 다듬은 칸에 대한 사람의 판단 */
type Pick = "tidy" | "raw";

/** 어느 결과에 대한 판단인지 함께 들고 다닌다 — 결과가 바뀌면 판단도 없던 일이 된다 */
const NO_PICKS: Record<number, Pick> = {};

/**
 * 광고 붙여넣기.
 * 목사님이 구글 문서로 올린 광고 전문을 통째로 붙여넣으면 블록으로 자동 변환한다.
 * 붙여넣고 잠시 기다리면 AI(Google AI Studio)가 제목과 내용을 갈라주고,
 * AI를 못 쓰는 상황이면 규칙 방식 결과가 그대로 남는다.
 * 원문에 섞여 온 주요일정과 본문 말씀도 함께 가려내 제자리에 넣는다.
 *
 * 한 덩어리로 뭉친 긴 줄글은 AI가 읽기 좋게 다듬은 글을 함께 보여준다.
 * 다듬은 칸은 사람이 하나씩 승인해야 하며, 그 전에는 적용 버튼이 열리지 않는다.
 */
export function AdPaste({ onApply, onClose }: Props) {
  const { confirm } = usePopup();
  const [text, setText] = useState("");
  const { blocks, source, note, status, error, retry } = useAdSplit(text);
  const [judged, setJudged] = useState<{ of: ParsedBlock[]; picks: Record<number, Pick> }>({
    of: [],
    picks: NO_PICKS,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 원문을 고치거나 다시 나누면 이전 승인은 다른 결과에 대한 것이라 버린다
  const picks = judged.of === blocks ? judged.picks : NO_PICKS;
  const choose = (i: number, pick: Pick) =>
    setJudged((prev) => ({
      of: blocks,
      picks: { ...(prev.of === blocks ? prev.picks : NO_PICKS), [i]: pick },
    }));

  const tidied = blocks.filter((b) => b.tidy).length;
  const approved = blocks.filter((b, i) => b.tidy && picks[i] === "tidy").length;
  const waiting = blocks.filter((b, i) => b.tidy && !picks[i]).length;
  const firstWaiting = blocks.findIndex((b, i) => b.tidy && !picks[i]);

  /** 목록이 길면 어느 칸이 잠근 것인지 찾기 어렵다 — 그 칸으로 데려다준다 */
  const goToWaiting = () => {
    document
      .getElementById(`ad-block-${firstWaiting}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 승인한 칸은 다듬은 글로, 아닌 칸은 원문 그대로 넣는다
  const toBlocks = (): FlowBlock[] =>
    blocks.map((b, i) => toFlowBlock(picks[i] === "tidy" && b.tidy ? { ...b, body: b.tidy } : b));

  /**
   * 전체 교체는 지금 적어둔 광고를 통째로 버린다.
   * 바로 옆 '뒤에 붙이기'와 나란히 서 있어 손이 미끄러지기 쉽고, 되돌릴 길이 없다.
   * (뒤에 붙이기는 묻지 않는다 — 잘못 눌러도 지워진 것이 없어 그 칸만 지우면 된다)
   */
  const askAndReplace = async () => {
    const ok = await confirm({
      title: "지금 광고를 전부 교체할까요?",
      desc: `적어두신 광고가 모두 사라지고 새로 읽어들인 ${blocks.length}칸으로 바뀝니다.\n되돌릴 수 없습니다.`,
      confirmLabel: "전체 교체",
      tone: "danger",
    });
    if (ok) onApply(toBlocks(), "replace");
  };

  return (
    // 폰에서는 화면을 통째로 쓴다 — 좁은 화면에 창을 띄우면 정작 글 넣을 자리가 남지 않는다
    <div
      // 이 창이 떠 있는 동안 Cmd+Z 는 브라우저에 맡긴다 — 붙여넣은 원문을 고치는 자리라
      // 주보를 되돌리는 것이 아니라 그 글상자를 되돌려야 한다
      data-modal
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(15,23,42,.45)" }}
    >
      <div
        className="flex h-full max-h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-w-4xl sm:rounded-2xl"
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

        {/* 좁은 화면에서는 원문과 결과를 위아래로 놓고 통째로 굴려 본다 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-2 lg:overflow-hidden lg:p-4">
          <div className="flex min-h-0 flex-col gap-2">
            <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
              원문
            </span>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"<주중 기도회>\n수요기도회와 목요이사야62에 적극적으로\n참여해주시기 바랍니다.\n\n<결혼>\n..."}
              className="min-h-[200px] flex-1 resize-none font-mono lg:min-h-[320px]"
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
              className="min-h-[200px] flex-1 overflow-auto rounded-lg border p-2 lg:min-h-[320px]"
              style={{
                borderColor: "var(--ui-border)",
                background: "#fafafa",
                // 아직 확정 전인 규칙 결과라는 걸 흐리기로 알린다
                opacity: status === "loading" ? 0.55 : 1,
                transition: "opacity .2s ease",
              }}
            >
              {/* 굴려 내려도 따라오게 붙여 둔다 — 왜 적용이 잠겼는지 늘 눈에 보여야 한다 */}
              {waiting > 0 && (
                <div
                  className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-lg border px-2.5 py-2"
                  style={{ background: "#e7f5ff", borderColor: "#74c0fc" }}
                >
                  <p className="min-w-0 flex-1 text-[11px] font-semibold leading-relaxed" style={{ color: "#1971c2" }}>
                    AI가 정리한 {waiting}칸을 아직 확인하지 않았습니다. 승인해야 아래 적용 버튼이 켜집니다.
                  </p>
                  <Btn size="sm" onClick={goToWaiting}>
                    확인할 칸으로
                  </Btn>
                </div>
              )}

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
                blocks.map((p, i) => {
                  const pick = picks[i];
                  // 다듬은 글이 있으면 그것을 먼저 보여준다 — 원문을 고르면 원문으로 돌아간다
                  const shown = p.tidy && pick !== "raw" ? { ...p, body: p.tidy } : p;

                  return (
                    <div
                      key={i}
                      id={`ad-block-${i}`}
                      className="mb-2 rounded-lg border bg-white p-2.5"
                      style={{
                        borderColor: p.tidy && !pick ? "#74c0fc" : p.confident ? "var(--ui-border)" : "#ffd8a8",
                      }}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
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
                        {p.tidy && pick !== "raw" && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: "#e7f5ff", color: "#1971c2" }}
                          >
                            AI 정리
                          </span>
                        )}
                      </div>
                      <BlockPreview block={shown} />
                      {p.tidy && <TidyReview raw={p.body} pick={pick} onPick={(v) => choose(i, v)} />}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div
          className="flex shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          style={{ borderColor: "var(--ui-border)" }}
        >
          <div className="min-w-0">
            <Hint>
              {status === "loading"
                ? "AI가 나누는 중입니다. 잠시만 기다려 주세요 — 지금 보이는 건 임시 결과입니다."
                : summarize(blocks)}
            </Hint>
            {/* 승인 전에는 적용할 수 없다. 잠긴 버튼 바로 옆에서 이유를 밝힌다. */}
            {waiting > 0 && (
              <button
                type="button"
                onClick={goToWaiting}
                className="mt-1 block w-full rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold leading-relaxed"
                style={{ background: "#e7f5ff", borderColor: "#74c0fc", color: "#1971c2" }}
              >
                AI가 읽기 좋게 정리한 칸이 {waiting}개 있습니다. 내용이 빠지지 않았는지 확인하고 <u>승인</u> 버튼을
                눌러야 적용할 수 있습니다. <span style={{ textDecoration: "underline" }}>확인하러 가기 →</span>
              </button>
            )}
            {/* 다 봤으면 무엇을 승인했는지 남겨 보여준다 */}
            {tidied > 0 && waiting === 0 && (
              <Hint>
                AI가 정리한 {tidied}칸 중 {approved}칸을 승인했습니다
                {tidied - approved > 0 && `, ${tidied - approved}칸은 원문 그대로 넣습니다`}.
              </Hint>
            )}
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
          <div className="flex shrink-0 gap-2">
            <Btn
              disabled={blocks.length === 0 || waiting > 0}
              onClick={() => onApply(toBlocks(), "append")}
              className="flex-1 sm:flex-none"
            >
              뒤에 추가
            </Btn>
            <Btn
              variant="primary"
              disabled={blocks.length === 0 || waiting > 0}
              onClick={() => void askAndReplace()}
              className="flex-1 sm:flex-none"
            >
              광고 전체 교체
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * AI가 다듬은 칸의 승인 자리.
 *
 * 다듬기는 글자를 바꾸는 일이라 기계가 아무리 걸러도 마지막은 사람이 봐야 한다.
 * 그래서 원문을 언제든 펼쳐 볼 수 있게 두고, 승인하거나 원문으로 되돌리기 전에는
 * 적용 버튼을 열어주지 않는다.
 */
function TidyReview({
  raw,
  pick,
  onPick,
}: {
  raw: string;
  pick?: Pick;
  onPick: (pick: Pick) => void;
}) {
  const [openRaw, setOpenRaw] = useState(false);

  return (
    <div className="mt-2 rounded-lg p-2" style={{ background: pick ? "#f8f9fa" : "#e7f5ff" }}>
      <p className="text-[11px] leading-relaxed" style={{ color: pick ? "var(--ui-muted)" : "#1971c2" }}>
        {pick === "tidy"
          ? "✓ 확인했습니다. AI가 정리한 글로 넣습니다."
          : pick === "raw"
            ? "✓ AI 정리를 쓰지 않고 원문 그대로 넣습니다."
            : "이 칸은 줄글이 길어 AI가 읽기 좋게 정리했습니다. 빠진 내용이 없는지 원문과 견줘 보고 승인해 주세요."}
      </p>

      <button
        type="button"
        onClick={() => setOpenRaw((v) => !v)}
        className="mt-1 text-[11px] font-semibold underline"
        style={{ color: "var(--ui-muted)" }}
      >
        원문 {openRaw ? "접기 ▴" : "보기 ▾"}
      </button>
      {openRaw && (
        <p
          className="mt-1 whitespace-pre-wrap rounded border bg-white p-2 text-[11px] leading-relaxed"
          style={{ borderColor: "var(--ui-border)", color: "var(--ui-muted)" }}
        >
          {flowBody(raw)}
        </p>
      )}

      <div className="mt-1.5 flex gap-1.5">
        <Btn size="sm" variant={pick === "tidy" ? "primary" : "default"} onClick={() => onPick("tidy")}>
          승인
        </Btn>
        <Btn size="sm" variant={pick === "raw" ? "primary" : "default"} onClick={() => onPick("raw")}>
          원문 그대로
        </Btn>
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

  // 주보에 들어갈 모양 그대로 — 이어 붙인 뒤의 본문을 보여준다
  return (
    <p className="whitespace-pre-wrap text-[11px] leading-relaxed" style={muted}>
      {flowBody(block.body)}
    </p>
  );
}

/** 나뉜 덩어리를 주보 블록으로 만든다 */
function toFlowBlock(p: ParsedBlock): FlowBlock {
  const heading = stripBrackets(p.title);

  // 소제목은 늘 '본문 말씀'이다. 원문 제목(`<8월 3일 말씀>`)은 버리고 제목·본문만 가져온다.
  if (p.kind === "sermon") {
    const { title, verse } = parseSermon(p.body);
    return { id: newId("ser"), kind: "sermon", heading: SERMON_HEADING, title, verse };
  }

  if (p.kind === "schedule") {
    return {
      id: newId("sch"),
      kind: "schedule",
      heading: heading || "주요일정",
      items: parseScheduleItems(p.body).map((it) => ({ id: newId("i"), ...it })),
    };
  }

  return { id: newId("ad"), kind: "ad", title: p.title, body: flowBody(p.body) };
}
