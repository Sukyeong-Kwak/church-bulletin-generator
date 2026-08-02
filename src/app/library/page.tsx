"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Hint, Section } from "@/components/ui";
import { getBackend } from "@/lib/backend";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { formatServiceDate } from "@/lib/layout";
import { useDoc } from "@/lib/store";
import type { BulletinDoc } from "@/lib/types";

/** 보관함 — 저장한 주보를 다시 열거나, 만들었던 이미지를 그대로 다시 받는다. */
export default function LibraryPage() {
  const { library, openSaved, duplicateSaved, removeSaved, startNew, saveCurrent, doc, dirty, loaded } =
    useDoc();
  const router = useRouter();

  if (!loaded) return null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-5">
      {dirty && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: "#fff4e6" }}
        >
          <span className="text-[12px] font-semibold" style={{ color: "#b45309" }}>
            작성 중인 주보에 저장하지 않은 변경이 있습니다. 다른 주보를 열면 사라집니다.
          </span>
          <Btn size="sm" variant="primary" onClick={saveCurrent}>
            지금 저장
          </Btn>
        </div>
      )}
      <Section
        title="보관함"
        desc="저장한 주보를 다시 열어 수정하거나, 지난주 것을 복사해 새로 만들 수 있습니다."
        right={
          <Btn
            onClick={() => {
              startNew();
              router.push("/");
            }}
          >
            새 주보 만들기
          </Btn>
        }
      >
        {library.length === 0 ? (
          <Hint>아직 저장한 주보가 없습니다. 작성 화면에서 저장을 누르면 여기에 쌓입니다.</Hint>
        ) : (
          <div className="flex flex-col gap-2">
            {library.map((b) => (
              <Row
                key={b.id}
                bulletin={b}
                current={b.id === doc.id}
                onOpen={() => {
                  openSaved(b.id);
                  router.push("/");
                }}
                onDuplicate={() => {
                  duplicateSaved(b.id);
                  router.push("/");
                }}
                onRemove={() => removeSaved(b.id)}
              />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Row({
  bulletin,
  current,
  onOpen,
  onDuplicate,
  onRemove,
}: {
  bulletin: BulletinDoc;
  current: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const [thumb, setThumb] = useState<string>();
  const [busy, setBusy] = useState(false);
  const firstKey = bulletin.imageKeys?.[0];

  useEffect(() => {
    let alive = true;
    let url: string | undefined;
    (async () => {
      if (!firstKey) return;
      const blob = await getBackend().getImage(firstKey);
      if (!blob || !alive) return;
      url = URL.createObjectURL(blob);
      setThumb(url);
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [firstKey]);

  const adCount = bulletin.blocks.filter((b) => b.kind === "ad").length;
  const imageCount = bulletin.imageKeys?.length ?? 0;

  const downloadImages = async () => {
    if (!bulletin.imageKeys?.length) return;
    setBusy(true);
    try {
      const blobs: Blob[] = [];
      for (const k of bulletin.imageKeys) {
        const blob = await getBackend().getImage(k);
        if (blob) blobs.push(blob);
      }
      const fmt = bulletin.exportFormat ?? "png";
      if (blobs.length === 1) saveBlob(blobs[0], fileNameFor(bulletin.serviceDate, 0, fmt));
      else await saveZip(blobs, bulletin.serviceDate, fmt);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border bg-white p-2.5 sm:flex-row sm:items-center"
      style={{ borderColor: current ? "var(--ui-accent)" : "var(--ui-border)" }}
    >
      <div
        className="flex h-16 w-[45px] shrink-0 items-center justify-center overflow-hidden rounded-md border"
        style={{ borderColor: "var(--ui-border)", background: "#f8f9fa" }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[9px]" style={{ color: "var(--ui-muted)" }}>
            이미지
            <br />
            없음
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold">{formatServiceDate(bulletin.serviceDate)}</span>
          {current && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "#eef2ff", color: "var(--ui-accent)" }}
            >
              작성 중
            </span>
          )}
        </div>
        <p className="text-[11px]" style={{ color: "var(--ui-muted)" }}>
          광고 {adCount}개
          {imageCount > 0 && ` · 이미지 ${imageCount}장 보관`}
          {bulletin.updatedAt && ` · ${new Date(bulletin.updatedAt).toLocaleString("ko-KR")}`}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5">
        <Btn size="sm" variant="primary" onClick={onOpen}>
          열기
        </Btn>
        <Btn size="sm" onClick={onDuplicate} title="이 주보를 복사해 다음 주 날짜로 새로 만듭니다">
          복사해서 새로
        </Btn>
        <Btn size="sm" disabled={!imageCount || busy} onClick={downloadImages}>
          {busy ? "준비 중…" : "이미지 받기"}
        </Btn>
        <Btn size="sm" variant="danger" onClick={onRemove}>
          삭제
        </Btn>
      </div>
    </div>
  );
}
