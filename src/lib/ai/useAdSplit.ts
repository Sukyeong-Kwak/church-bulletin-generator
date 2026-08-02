"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseAdText, type ParsedBlock } from "@/lib/parseAds";
import { MAX_INPUT, type ParseErrorResponse, type ParseFailure, type ParseResponse } from "./types";

export type SplitStatus = "idle" | "loading" | "done" | "error";

/** 어느 원문에서 나온 결과인지 함께 들고 다닌다 — 원문이 또 바뀌면 낡은 것으로 본다 */
interface ForText<T> {
  forText: string;
  value: T;
}

interface AiResult {
  blocks: ParsedBlock[];
  source: "ai" | "rule";
  note?: string;
}

interface Failure {
  code: ParseFailure;
  message: string;
}

/**
 * 붙여넣은 원문을 광고 블록으로 나눈다.
 *
 * 규칙 파서 결과를 곧바로 보여주고, 잠시 뒤 AI 구분 결과가 오면 그것으로 바꾼다.
 * AI가 안 되면(키 없음·한도·오류) 규칙 결과가 그대로 남으므로 화면이 비는 일은 없다.
 */
export function useAdSplit(text: string) {
  const rule = useMemo(() => parseAdText(text), [text]);
  const [ai, setAi] = useState<ForText<AiResult> | null>(null);
  const [failure, setFailure] = useState<ForText<Failure> | null>(null);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    const body = text.trim();
    if (!body || body.length > MAX_INPUT) return;

    const ctrl = new AbortController();
    // 타이핑·붙여넣기가 멎은 뒤에 한 번만 부른다
    const timer = setTimeout(() => {
      fetch("/api/parse-ads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      })
        .then(async (res) => {
          const data: unknown = await res.json().catch(() => null);
          if (!res.ok) {
            const failed = data as ParseErrorResponse | null;
            setFailure({
              forText: text,
              value: {
                code: failed?.error ?? "upstream",
                message: failed?.message ?? "AI 구분에 실패했습니다.",
              },
            });
            return;
          }
          const okData = data as ParseResponse;
          setAi({
            forText: text,
            value: { blocks: okData.blocks, source: okData.source, note: okData.note },
          });
        })
        .catch(() => {
          if (ctrl.signal.aborted) return;
          setFailure({
            forText: text,
            value: { code: "network", message: "AI 구분을 부르지 못했습니다." },
          });
        });
    }, 900);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [text, again]);

  const retry = useCallback(() => {
    setAi(null);
    setFailure(null);
    setAgain((n) => n + 1);
  }, []);

  const body = text.trim();
  const tooLong = body.length > MAX_INPUT;
  const done = ai?.forText === text ? ai.value : null;
  const failed = failure?.forText === text ? failure.value : null;

  const status: SplitStatus = !body
    ? "idle"
    : tooLong || failed
      ? "error"
      : done
        ? "done"
        : "loading"; // 디바운스 대기 중도 곧 부를 참이므로 '나누는 중'으로 본다

  return {
    blocks: done ? done.blocks : rule,
    source: done ? done.source : ("rule" as const),
    note: done?.note,
    status,
    error: tooLong
      ? {
          code: "bad-request" as ParseFailure,
          message: `한 번에 ${MAX_INPUT.toLocaleString()}자까지 나눌 수 있습니다. 나눠서 붙여넣어 주세요.`,
        }
      : failed,
    retry,
  };
}
