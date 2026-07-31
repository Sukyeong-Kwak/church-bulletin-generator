"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { saveBlob } from "@/lib/exportImages";
import { Btn, Hint, Section } from "../ui";

/** 내려받을 수 있는 QR 크기 */
const SIZES = [256, 512, 1024, 2048] as const;
type Size = (typeof SIZES)[number];

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
    const dataUrl = await QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
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
                key={s}
                size="sm"
                variant={size === s ? "primary" : "default"}
                onClick={() => setSize(s)}
              >
                {s}px
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
