"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { saveBlob } from "@/lib/exportImages";
import { Btn, Hint, Section } from "../ui";

/**
 * 내려받을 수 있는 QR 크기.
 * 2480px는 300dpi로 뽑은 A4 짧은 변이라 A4에 꽉 차게 인쇄된다.
 */
const SIZES = [
  { px: 256, label: "256px", desc: "화면·게시글용" },
  { px: 512, label: "512px", desc: "밴드 게시글에 얹기" },
  { px: 1024, label: "1024px", desc: "주보에 얹기" },
  { px: 2048, label: "2048px", desc: "A4 절반 인쇄" },
  { px: 2480, label: "A4 2480px", desc: "A4 가득 채워 인쇄 (300dpi)" },
] as const;
type Size = (typeof SIZES)[number]["px"];

interface Props {
  shareToken?: string;
  serviceDate: string;
}

/**
 * 공유 QR.
 * 이 코드를 찍으면 로그인 없이 주보 전체를 볼 수 있다. 새가족부 QR에 그대로 쓴다.
 */
export function ShareCard({ shareToken, serviceDate }: Props) {
  const [size, setSize] = useState<Size>(512);
  const [preview, setPreview] = useState<string>();
  const [copied, setCopied] = useState(false);

  // 주소는 브라우저에서만 알 수 있다. 이 화면은 클라이언트에서만 그려지므로 렌더 중에 읽어도 된다.
  const url = useMemo(() => {
    if (!shareToken || typeof window === "undefined") return "";
    return `${window.location.origin}/share/${shareToken}`;
  }, [shareToken]);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then((d) => alive && setPreview(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);

  if (!shareToken) {
    return (
      <Section title="공유 QR" desc="찍으면 로그인 없이 주보 전체를 볼 수 있습니다.">
        <Hint>
          공유 링크는 서버에 저장된 주보에만 생깁니다. 로그인해서 저장하면 QR이 만들어집니다.
        </Hint>
      </Section>
    );
  }

  const download = async () => {
    // 늘려 키우는 것이 아니라 그 크기로 새로 그리므로 선이 또렷하다.
    // 인쇄용이라 여백까지 흰색으로 채운다.
    const dataUrl = await QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    const blob = await (await fetch(dataUrl)).blob();
    saveBlob(blob, `주보QR_${serviceDate}_${size}px.png`);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Section title="공유 QR" desc="찍으면 로그인 없이 주보 전체를 볼 수 있습니다.">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className="shrink-0 rounded-xl border bg-white p-2"
          style={{ borderColor: "var(--ui-border)" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="공유 QR" width={120} height={120} />
          ) : (
            <div style={{ width: 120, height: 120 }} />
          )}
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <input type="text" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
              크기
            </span>
            {SIZES.map((s) => (
              <Btn
                key={s.px}
                size="sm"
                variant={size === s.px ? "primary" : "default"}
                onClick={() => setSize(s.px)}
                title={s.desc}
              >
                {s.label}
              </Btn>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Btn variant="primary" onClick={download}>
              QR 이미지 받기 ({size}px)
            </Btn>
            <Btn onClick={copy}>{copied ? "복사됨" : "링크 복사"}</Btn>
            <a href={url} target="_blank" rel="noreferrer">
              <Btn>열어보기</Btn>
            </a>
          </div>

          <Hint>
            인쇄물에 넣을 거라면 1024px 이상을 권합니다. 주보 내용을 고치면 같은 QR에 바뀐 내용이
            그대로 반영됩니다.
          </Hint>
        </div>
      </div>
    </Section>
  );
}
