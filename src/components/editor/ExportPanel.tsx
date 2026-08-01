"use client";

import { useState } from "react";
import {
  fileNameFor,
  formatBytes,
  pixelLabel,
  renderAll,
  saveBlob,
  saveZip,
} from "@/lib/exportImages";
import { putImage } from "@/lib/imageStore";
import { newId } from "@/lib/store";
import type { BulletinDoc, ExportScale } from "@/lib/types";
import { Btn } from "../ui";
// QR 공유는 잠시 내려둔다 — 이미지를 이 컴퓨터의 .shares 폴더에 두는 방식이라
// 서버가 꺼지면 QR도 죽는다. DB(또는 저장소)를 붙인 뒤에야 쓸모가 있다.
// 되살릴 때는 아래 import와 SharePanel 블록의 주석만 풀면 된다.
// import { SharePanel } from "./SharePanel";

interface Props {
  doc: BulletinDoc;
  setDoc: (updater: (prev: BulletinDoc) => BulletinDoc) => void;
  getNodes: () => HTMLElement[];
  onImagesReady: (docId: string, keys: string[]) => void;
  pageCount: number;
}

/** 미리보기 위에 항상 떠 있는 내보내기 바. 주보 만들기의 마지막 단계라 가장 눈에 띄는 자리에 둔다. */
export function ExportPanel({ doc, setDoc, getNodes, onImagesReady, pageCount }: Props) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  const [totalSize, setTotalSize] = useState(0);

  /** 만든 이미지를 보관해 과거 주보에서 그대로 다시 받을 수 있게 한다 */
  async function keep(blobs: Blob[]) {
    const keys: string[] = [];
    for (const b of blobs) {
      const key = newId("png");
      await putImage(key, b);
      keys.push(key);
    }
    onImagesReady(doc.id, keys);
  }

  const run = async (action: "zip" | "each") => {
    setBusy(true);
    setError(undefined);
    setDone(false);
    setProgress(null);
    try {
      const nodes = getNodes();
      if (nodes.length === 0) throw new Error("내보낼 페이지가 없습니다.");
      const fmt = doc.exportFormat;
      const blobs = await renderAll(nodes, doc.exportScale, fmt, (d, t) =>
        setProgress({ done: d, total: t }),
      );
      if (action === "zip") await saveZip(blobs, doc.serviceDate, fmt);
      else blobs.forEach((b, i) => saveBlob(b, fileNameFor(doc.serviceDate, i, fmt)));
      setTotalSize(blobs.reduce((sum, b) => sum + b.size, 0));
      await keep(blobs);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기에 실패했습니다.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="border-b bg-white" style={{ borderColor: "var(--ui-border)" }}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <Btn
          variant="primary"
          disabled={busy}
          onClick={() => run("zip")}
          className="w-full sm:w-auto"
          style={{ fontSize: 14, padding: "10px 18px" }}
        >
          {busy ? "만드는 중…" : `전체 ${pageCount}장 이미지 내보내기 (ZIP)`}
        </Btn>
        <Btn disabled={busy} onClick={() => run("each")}>
          개별 파일로 받기
        </Btn>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
            화질
          </span>
          {([2, 3, 4] as ExportScale[]).map((s) => (
            <Btn
              key={s}
              size="sm"
              variant={doc.exportScale === s ? "primary" : "default"}
              onClick={() => setDoc((d) => ({ ...d, exportScale: s }))}
              title={`${pixelLabel(s)} px`}
            >
              {s}배
            </Btn>
          ))}
          <span className="text-[11px]" style={{ color: "var(--ui-muted)" }}>
            {pixelLabel(doc.exportScale)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
            형식
          </span>
          {(
            [
              ["jpg", "JPG", "화질 거의 그대로, 용량이 작아 밴드·카톡 공유에 적합"],
              ["png", "PNG", "무손실 최고 화질. 사진 배경이면 장당 10MB가 넘을 수 있음"],
            ] as const
          ).map(([f, label, tip]) => (
            <Btn
              key={f}
              size="sm"
              variant={doc.exportFormat === f ? "primary" : "default"}
              onClick={() => setDoc((d) => ({ ...d, exportFormat: f }))}
              title={tip}
            >
              {label}
            </Btn>
          ))}
        </div>

        {progress && (
          <span className="text-[12px] font-semibold" style={{ color: "var(--ui-accent)" }}>
            {progress.done} / {progress.total} 페이지 생성 중…
          </span>
        )}
        {error && (
          <span className="text-[12px]" style={{ color: "#c92a2a" }}>
            {error}
          </span>
        )}
      </div>

      {done && (
        <div className="px-4 py-2" style={{ background: "#f1f8f4" }}>
          <span className="text-[12px] font-bold" style={{ color: "#2b8a3e" }}>
            내보내기 완료 · {pageCount}장 {formatBytes(totalSize)} · 보관함에 저장되어 나중에 다시
            받을 수 있습니다
          </span>
        </div>
      )}

      {/*
      <div className="border-t" style={{ borderColor: "var(--ui-border)" }}>
        <SharePanel doc={doc} />
      </div>
      */}
    </div>
  );
}
