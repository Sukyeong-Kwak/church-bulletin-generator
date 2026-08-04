"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Hint, Section } from "@/components/ui";
import { getBackend } from "@/lib/backend";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { formatServiceDate } from "@/lib/layout";
import { useDoc } from "@/lib/store";
import { useAuth } from "@/lib/supabase/useAuth";
import type { BulletinDoc } from "@/lib/types";

/** 보관함 — 저장한 주보를 다시 열거나, 만들었던 이미지를 그대로 다시 받는다. */
export default function LibraryPage() {
  const {
    library,
    openSaved,
    duplicateSaved,
    removeSaved,
    startNew,
    saveCurrent,
    doc,
    dirty,
    loaded,
    published,
    publishSaved,
    error,
  } = useDoc();
  const { user, enabled, loading: authLoading } = useAuth();
  const router = useRouter();

  // 지난 주보는 여럿이 함께 보는 기록이라 관리자만 지운다.
  // 서버를 쓰지 않는 로컬 모드에는 계정 자체가 없어 그대로 열어 둔다.
  const canDelete = !enabled || user?.role === "admin";
  // 누구인지 알아내는 동안에는 아무 말도 하지 않는다 —
  // 관리자인데도 '관리자만 삭제할 수 있다'가 잠깐 떴다 사라지면 읽는 사람만 헷갈린다
  const showDeleteNote = !authLoading && !canDelete;

  if (!loaded) return null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-5">
      {error && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: "#fee2e2" }}>
          <span className="text-[12px] font-semibold" style={{ color: "#b91c1c" }}>
            {error}
          </span>
        </div>
      )}
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
        desc={
          showDeleteNote
            ? "저장한 주보를 다시 열어 수정하거나, 지난주 것을 복사해 새로 만들 수 있습니다. 삭제는 관리자만 할 수 있습니다."
            : "저장한 주보를 다시 열어 수정하거나, 지난주 것을 복사해 새로 만들 수 있습니다."
        }
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
                live={!!published?.publishedAt && published.bulletinId === b.id}
                canPublish={!!published}
                onPublish={() => publishSaved(b.id)}
                onOpen={() => {
                  openSaved(b.id);
                  router.push("/");
                }}
                onDuplicate={() => {
                  duplicateSaved(b.id);
                  router.push("/");
                }}
                onRemove={canDelete ? () => void removeSaved(b.id) : undefined}
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
  live,
  canPublish,
  onPublish,
  onOpen,
  onDuplicate,
  onRemove,
}: {
  bulletin: BulletinDoc;
  current: boolean;
  /** 지금 교회 QR에 올라가 있는 주보인지 */
  live: boolean;
  canPublish: boolean;
  onPublish: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  /** 없으면 삭제 권한이 없다는 뜻 — 버튼을 아예 보이지 않는다 */
  onRemove?: () => void;
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
          {/* 교회 QR을 찍으면 지금 이것이 보인다 */}
          {live && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "#ebfbee", color: "#2b8a3e" }}
              title="입구에 붙인 QR을 찍으면 이 주보가 보입니다"
            >
              QR에 올라감
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
          복제
        </Btn>
        {canPublish && !live && (
          <Btn
            size="sm"
            onClick={onPublish}
            title={
              imageCount
                ? "교회 QR이 이 주보를 보여주게 바꿉니다"
                : "이 주보에는 보관된 이미지가 없어 폰에서 화면으로 다시 그려집니다"
            }
          >
            QR에 올리기
          </Btn>
        )}
        <Btn size="sm" disabled={!imageCount || busy} onClick={downloadImages}>
          {busy ? "준비 중…" : "이미지 받기"}
        </Btn>
        {onRemove && (
          <Btn size="sm" variant="danger" onClick={onRemove}>
            삭제
          </Btn>
        )}
      </div>
    </div>
  );
}
