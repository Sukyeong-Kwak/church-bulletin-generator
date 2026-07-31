"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { getImage } from "@/lib/imageStore";
import type { BulletinDoc } from "@/lib/types";
import { Btn, Hint } from "../ui";

interface Props {
  doc: BulletinDoc;
}

/** 받을 수 있는 QR 크기. 2480px는 300dpi로 뽑은 A4 짧은 변이라 A4에 꽉 차게 인쇄된다. */
const SIZES = [
  { px: 512, label: "작게 512px", desc: "화면·게시글용" },
  { px: 1024, label: "보통 1024px", desc: "주보에 얹기" },
  { px: 2048, label: "크게 2048px", desc: "A4 절반 인쇄" },
  { px: 2480, label: "A4 2480px", desc: "A4 가득 채워 인쇄 (300dpi)" },
] as const;

type State = "idle" | "uploading" | "ready" | "error";

/**
 * 폰으로 보는 주보 QR.
 *
 * 내보낸 이미지는 만든 사람의 브라우저에만 있어서 QR을 찍은 폰이 가져갈 곳이 없다.
 * 그래서 '폰으로 보내기'를 누르면 이미지를 서버에 한 번 올리고, 그 주소의 QR을 만든다.
 * 주보 번호로 올리므로 다시 내보내 올려도 이미 뿌린 QR은 그대로 쓸 수 있다.
 */
export function SharePanel({ doc }: Props) {
  const [state, setState] = useState<State>("idle");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();
  const [size, setSize] = useState<number>(1024);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const keys = useMemo(() => doc.imageKeys ?? [], [doc.imageKeys]);

  // 이미 올려둔 것이 있으면 다시 올리지 않고 QR부터 보여준다
  useEffect(() => {
    let alive = true;
    fetch(`/api/share/${doc.id}`)
      .then(async (res) => {
        if (!alive || !res.ok) return;
        const data = (await res.json()) as { urls: string[] };
        setUrl(data.urls[0] ?? "");
        setState("ready");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [doc.id]);

  // 화면용 QR은 작게 그린다 — 받을 때만 고른 크기로 다시 그린다
  useEffect(() => {
    if (!url || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
    });
  }, [url]);

  const upload = useCallback(async () => {
    setState("uploading");
    setError(undefined);
    try {
      const form = new FormData();
      form.set("serviceDate", doc.serviceDate);
      form.set("ext", doc.exportFormat);

      for (const key of keys) {
        const blob = await getImage(key);
        if (blob) form.append("page", blob);
      }
      if (!form.has("page")) throw new Error("올릴 이미지가 없습니다. 먼저 내보내기를 해주세요.");

      const res = await fetch(`/api/share/${doc.id}`, { method: "POST", body: form });
      const data = (await res.json()) as { urls?: string[]; message?: string };
      if (!res.ok) throw new Error(data.message ?? "올리지 못했습니다.");

      setUrl(data.urls?.[0] ?? "");
      setState("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다.");
      setState("error");
    }
  }, [doc.id, doc.serviceDate, doc.exportFormat, keys]);

  /** 고른 크기로 새로 그려 받는다. 늘려 키우는 것이 아니라 그 크기로 그리므로 선이 또렷하다. */
  const download = useCallback(async () => {
    if (!url) return;
    const dataUrl = await QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      // 인쇄용이라 여백까지 흰색으로 채운다
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${doc.serviceDate}_주보QR_${size}.png`;
    a.click();
  }, [url, size, doc.serviceDate]);

  return (
    <div className="flex flex-wrap items-start gap-4 px-4 py-3">
      <div className="flex flex-col items-center gap-1.5">
        <canvas
          ref={canvasRef}
          className="rounded-lg border bg-white"
          style={{ borderColor: "var(--ui-border)", width: 132, height: 132 }}
        />
        {!url && (
          <span className="text-[11px]" style={{ color: "var(--ui-subtle)" }}>
            아직 없음
          </span>
        )}
      </div>

      <div className="flex min-w-[240px] flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="primary" disabled={state === "uploading" || keys.length === 0} onClick={upload}>
            {state === "uploading" ? "올리는 중…" : url ? "다시 올리기" : "폰으로 보내기 (QR 만들기)"}
          </Btn>
          {url && (
            <>
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                style={{ width: "auto" }}
                title={SIZES.find((s) => s.px === size)?.desc}
              >
                {SIZES.map((s) => (
                  <option key={s.px} value={s.px}>
                    {s.label}
                  </option>
                ))}
              </select>
              <Btn onClick={download}>QR PNG 받기</Btn>
            </>
          )}
        </div>

        {url ? (
          <>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-[12px] font-semibold"
              style={{ color: "var(--ui-accent)" }}
            >
              {url}
            </a>
            <Hint>
              같은 와이파이에 있는 폰에서 열립니다. 이 컴퓨터의 서버가 꺼지면 QR도 열리지 않으니,
              밖에서도 열리게 하려면 서버를 어딘가에 올려두어야 합니다.
            </Hint>
          </>
        ) : keys.length === 0 ? (
          <Hint>먼저 이미지를 내보내면 그 이미지를 폰으로 보낼 수 있습니다.</Hint>
        ) : (
          <Hint>
            누르면 내보낸 {keys.length}장을 서버에 올리고, 폰으로 찍어서 볼 수 있는 QR을 만듭니다.
          </Hint>
        )}

        {error && (
          <span className="text-[12px]" style={{ color: "#c92a2a" }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
