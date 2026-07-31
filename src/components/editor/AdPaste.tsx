"use client";

import { useEffect, useMemo, useState } from "react";
import { parseAdText, summarize } from "@/lib/parseAds";
import { newId } from "@/lib/store";
import type { AdBlock } from "@/lib/types";
import { Btn, Hint } from "../ui";

interface Props {
  onApply: (blocks: AdBlock[], mode: "replace" | "append") => void;
  onClose: () => void;
}

/**
 * 광고 붙여넣기.
 * 목사님이 구글 문서로 올린 광고 전문을 통째로 붙여넣으면 블록으로 자동 변환한다.
 */
export function AdPaste({ onApply, onClose }: Props) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseAdText(text), [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toBlocks = (): AdBlock[] =>
    parsed.map((p) => ({
      id: newId("ad"),
      kind: "ad" as const,
      title: p.title,
      body: p.body,
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(15,23,42,.45)" }}>
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white"
        style={{ boxShadow: "0 20px 50px rgba(0,0,0,.25)" }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--ui-border)" }}>
          <div>
            <h2 className="text-[14px] font-bold">광고 붙여넣기</h2>
            <Hint>구글 문서의 광고 내용을 전부 복사해서 그대로 붙여넣으세요.</Hint>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            닫기
          </Btn>
        </div>

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
            <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
              변환 결과 {parsed.length > 0 && `(${parsed.length}개)`}
            </span>
            <div className="min-h-[320px] flex-1 overflow-auto rounded-lg border p-2" style={{ borderColor: "var(--ui-border)", background: "#fafafa" }}>
              {parsed.length === 0 ? (
                <p className="p-3 text-[12px]" style={{ color: "var(--ui-muted)" }}>
                  왼쪽에 붙여넣으면 광고 블록으로 나뉜 결과가 여기에 표시됩니다.
                </p>
              ) : (
                parsed.map((p, i) => (
                  <div
                    key={i}
                    className="mb-2 rounded-lg border bg-white p-2.5"
                    style={{ borderColor: p.confident ? "var(--ui-border)" : "#ffd8a8" }}
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-[12px] font-bold">
                        {p.title || <span style={{ color: "#f08c00" }}>제목 없음</span>}
                      </span>
                      {!p.confident && (
                        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#fff4e6", color: "#b45309" }}>
                          확인 필요
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-[11px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
                      {p.body}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: "var(--ui-border)" }}>
          <Hint>{summarize(parsed)}</Hint>
          <div className="flex gap-2">
            <Btn disabled={parsed.length === 0} onClick={() => onApply(toBlocks(), "append")}>
              뒤에 추가
            </Btn>
            <Btn variant="primary" disabled={parsed.length === 0} onClick={() => onApply(toBlocks(), "replace")}>
              광고 전체 교체
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
