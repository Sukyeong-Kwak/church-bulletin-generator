"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { renderAll, saveBlob } from "@/lib/exportImages";
import { formatServiceDate } from "@/lib/layout";
import { nowUrl } from "@/lib/publish";
import { useDoc } from "@/lib/store";
import { Btn, Hint, Section, Warn } from "../ui";

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

/**
 * 교회 QR.
 *
 * 주소는 하나뿐이라 QR도 한 장이면 된다. 한 번 뽑아 입구에 붙여두고,
 * 매주 '이 주보를 QR에 올리기'만 누르면 같은 코드가 이번 주 주보를 보여준다.
 *
 * 저장은 공개가 아니다. 올리기 전에는 QR을 찍어도 아무것도 보이지 않는다 —
 * 작성 중인 주보가 새어 나가지 않게 하기 위해서다.
 */
export function ShareCard({ getNodes }: { getNodes: () => HTMLElement[] }) {
  const { doc, library, published, publishCurrent, unpublish, saving, error } = useDoc();
  const [size, setSize] = useState<Size>(512);
  const [preview, setPreview] = useState<string>();
  const [copied, setCopied] = useState(false);

  // 주소는 브라우저에서만 알 수 있다. 이 화면은 클라이언트에서만 그려지므로 렌더 중에 읽어도 된다.
  const url = useMemo(() => nowUrl(), []);

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

  if (!published) {
    return (
      <Section title="교회 QR" desc="찍으면 로그인 없이 주보를 볼 수 있습니다.">
        <Hint>서버에 연결해야 QR 공유를 쓸 수 있습니다. 로그인한 뒤에 다시 열어주세요.</Hint>
      </Section>
    );
  }

  const isMine = !!published.bulletinId && published.bulletinId === doc.id;
  const live = library.find((b) => b.id === published.bulletinId);

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
    saveBlob(blob, `교회주보QR_${size}px.png`);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /** 폰에서 보여줄 페이지 이미지. 내보내기와 같은 그림이다. */
  const makeImages = async () => {
    const nodes = getNodes();
    if (nodes.length === 0) throw new Error("올릴 페이지가 없습니다.");
    return renderAll(nodes, doc.exportScale, doc.exportFormat);
  };

  return (
    <Section title="교회 QR" desc="코드는 하나입니다. 매주 올리기만 누르면 같은 코드가 새 주보를 보여줍니다.">
      <div className="flex flex-wrap items-start gap-3">
        <div
          className="shrink-0 rounded-xl border bg-white p-2"
          style={{ borderColor: "var(--ui-border)" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="교회 QR" width={120} height={120} />
          ) : (
            <div style={{ width: 120, height: 120 }} />
          )}
        </div>

        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          {/* 지금 이 QR을 찍으면 무엇이 보이는지부터 알려준다 */}
          <div
            className="rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
            style={
              published.publishedAt
                ? { background: "#f1f8f4", color: "#2b8a3e" }
                : { background: "#f6f7f9", color: "var(--ui-muted)" }
            }
          >
            {published.publishedAt ? (
              <>
                <b>
                  {live ? `${formatServiceDate(live.serviceDate)} 주보` : "저장된 주보"}
                  {isMine && " (지금 보고 있는 주보)"}
                </b>
                가 올라가 있습니다
                <br />
                {new Date(published.publishedAt).toLocaleString("ko-KR")} 적용
              </>
            ) : (
              <>아직 아무 주보도 올라가 있지 않습니다. QR을 찍으면 빈 안내만 보입니다.</>
            )}
          </div>

          <input type="text" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />

          <div className="flex flex-wrap gap-1.5">
            <Btn variant="primary" disabled={saving} onClick={() => void publishCurrent(makeImages)}>
              {saving
                ? "올리는 중…"
                : isMine
                  ? "다시 올리기 (내용 갱신)"
                  : "이 주보를 QR에 올리기"}
            </Btn>
            {published.publishedAt && (
              <Btn variant="danger" disabled={saving} onClick={() => void unpublish()}>
                내리기
              </Btn>
            )}
            <Btn onClick={copy}>{copied ? "복사됨" : "링크 복사"}</Btn>
            <a href={url} target="_blank" rel="noreferrer">
              <Btn>열어보기</Btn>
            </a>
          </div>

          {error && <Warn>{error}</Warn>}

          <Hint>
            올리면 이 주보가 저장되고, 지금 화면 그대로 페이지 이미지를 새로 만들어 올립니다.
            폰에서는 그 이미지가 보이므로 인쇄물과 똑같습니다. 페이지 수에 따라 몇 초 걸립니다.
            내용을 고친 뒤에는 다시 올려야 바뀝니다.
          </Hint>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
              QR 이미지
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
            <Btn size="sm" onClick={download}>
              받기
            </Btn>
          </div>
          <Hint>인쇄물에 넣을 거라면 1024px 이상을 권합니다. QR은 한 번만 뽑으면 됩니다.</Hint>
        </div>
      </div>
    </Section>
  );
}
