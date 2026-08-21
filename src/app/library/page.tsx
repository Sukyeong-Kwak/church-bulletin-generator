"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePopup } from "@/components/Popup";
import { StorageMeter } from "@/components/StorageMeter";
import { Btn, Hint, Section } from "@/components/ui";
import { getBackend } from "@/lib/backend";
import { imagePairUrls, URL_TTL } from "@/lib/backend/images";
import { fileNameFor, saveBlob, saveZip } from "@/lib/exportImages";
import { formatServiceDate } from "@/lib/layout";
import { useDoc } from "@/lib/store";
import { useAuth } from "@/lib/supabase/useAuth";
import type { BulletinDoc } from "@/lib/types";

/**
 * 목록에 걸 썸네일을 한 번에 받는다. 주보 id → 주소.
 *
 * 줄마다 따로 물어보면 주보가 스무 부일 때 요청이 스무 번 나간다. 게다가 축소본을 만들기 전에
 * 내보낸 옛 주보는 원본으로 되돌아가느라 한 번씩 더 물어, 마흔 번까지 늘어난다.
 * 첫 장 키를 모아 한 번에 물어보면 왕복은 한 번(옛 주보가 섞여 있어도 두 번)으로 끝난다.
 */
function useThumbs(library: BulletinDoc[]): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  /**
   * 지금 화면이 쓰고 있는 주소 한 벌.
   *
   * 새것이 자리 잡은 뒤에 옛것을 거둔다. 정리(cleanup)에서 먼저 거두면 —
   * 주보 한 부를 지워 목록이 달라지는 순간이 그렇다 — 남은 줄들의 썸네일이
   * 새 주소가 도착할 때까지 빈칸이 된다.
   */
  const held = useRef<(string | null)[]>([]);

  // 첫 장이 바뀐 주보가 없으면 다시 받지 않는다
  const signature = library.map((b) => `${b.id}:${b.imageKeys?.[0] ?? ""}`).join("|");

  useEffect(() => {
    let alive = true;
    const backend = getBackend();

    const rows = library
      .map((b) => ({ id: b.id, key: b.imageKeys?.[0] }))
      .filter((r): r is { id: string; key: string } => !!r.key);

    (async () => {
      const got =
        rows.length === 0
          ? []
          : await imagePairUrls(
              backend,
              rows.map((r) => r.key),
              URL_TTL.edit,
            );

      if (!alive) {
        backend.releaseUrls(got);
        return;
      }

      const next: Record<string, string> = {};
      rows.forEach((r, i) => {
        const url = got[i];
        if (url) next[r.id] = url;
      });

      const previous = held.current;
      held.current = got;
      setThumbs(next);
      backend.releaseUrls(previous);
    })();

    return () => {
      alive = false;
    };
    // library 는 목록이 그대로여도 매번 새 배열이다 — 실제로 달라졌는지는 signature 가 안다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // 화면을 떠날 때 마지막 한 벌을 거둔다
  useEffect(() => {
    return () => {
      getBackend().releaseUrls(held.current);
      held.current = [];
    };
  }, []);

  return thumbs;
}

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
    removeMany,
    error,
  } = useDoc();
  const { user, enabled, loading: authLoading } = useAuth();
  const thumbs = useThumbs(library);
  const { notify, confirm } = usePopup();
  const router = useRouter();

  /**
   * 골라둔 주보.
   *
   * 지울 것이 열 부면 한 부씩 열 번 묻고 열 번 누르게 된다. 그 사이에 손이 미끄러지기도 하고,
   * 무엇을 지웠는지도 헷갈린다. 먼저 다 골라놓고 한 번만 확인하는 편이 안전하다.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /*
   * 실제로 고른 것은 목록에 아직 있는 것뿐이다.
   *
   * 지우고 나면 골라둔 표에는 없어진 id가 남는데, 따로 솎아내지 않고 읽을 때 목록과 맞춰본다 —
   * 화면에 나오는 수와 지우러 가는 목록이 같은 곳에서 나오므로 둘이 어긋날 자리가 없다.
   */
  const pickedList = useMemo(() => library.filter((b) => picked.has(b.id)), [library, picked]);

  /**
   * 고른 것을 한꺼번에 지운다.
   *
   * 무엇이 사라지는지 날짜로 되짚어 보여준다 — 'N부'라고만 하면 방금 무엇을 골랐는지
   * 기억에 기대게 된다. 다만 많이 골랐을 때 확인창이 화면을 넘어가지 않게 앞의 몇 개만 적는다.
   */
  const askAndRemovePicked = async () => {
    if (pickedList.length === 0) return;

    const shown = pickedList.slice(0, 5).map((b) => formatServiceDate(b.serviceDate));
    const rest = pickedList.length - shown.length;
    const list = shown.join(", ") + (rest > 0 ? ` 외 ${rest}부` : "");

    /*
     * 지금 QR에 올라가 있는 것이 섞였으면 따로 말해준다.
     *
     * 한 부씩 지울 때는 그 줄의 '지금 공유 중' 표를 보고 누르지만, 여러 부를 쓸어 담을 때는
     * 그 표가 눈에 들어오지 않는다. 지우는 순간 입구 QR을 찍는 사람에게 아무것도 안 보인다.
     */
    const liveOne = pickedList.find((b) => b.id === published?.bulletinId && published?.publishedAt);
    const warning = liveOne
      ? `\n\n지금 교회 QR에 올라가 있는 ${formatServiceDate(liveOne.serviceDate)} 주보가 들어 있습니다. 지우면 QR을 찍어도 아무것도 보이지 않습니다.`
      : "";

    const ok = await confirm({
      title: `고른 주보 ${pickedList.length}부를 지울까요?`,
      desc: `${list}\n\n주보와 만들어둔 페이지 이미지가 함께 사라집니다. 되돌릴 수 없습니다.${warning}`,
      confirmLabel: `${pickedList.length}부 삭제`,
      tone: "danger",
    });
    if (!ok) return;

    setRemoving(true);
    try {
      const { removed, failed } = await removeMany(pickedList.map((b) => b.id));
      setPicked(new Set());
      if (failed > 0) {
        notify(`${removed}부를 지웠습니다. ${failed}부는 지우지 못했습니다.`, { tone: "warn" });
      } else if (removed > 0) {
        notify(`${removed}부를 지웠습니다.`, { tone: "info" });
      }
    } finally {
      setRemoving(false);
    }
  };

  /**
   * 지운 주보는 돌아오지 않는다. 만들어둔 페이지 이미지까지 함께 사라진다.
   * 목록의 다른 버튼들과 나란히 서 있어 손이 미끄러지기 쉬운 자리다.
   */
  const askAndRemove = async (b: { id: string; serviceDate: string }) => {
    const ok = await confirm({
      title: `${formatServiceDate(b.serviceDate)} 주보를 지울까요?`,
      desc: "주보와 만들어둔 페이지 이미지가 함께 사라집니다. 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;

    if (await removeSaved(b.id)) notify("지웠습니다.", { tone: "info" });
  };

  /**
   * 새 주보로 넘어가기.
   *
   * 저장하지 않은 것이 있을 때만 묻는다 — 늘 물으면 평소에 클릭만 한 번씩 늘어난다.
   * 지금 것을 저장하고 넘어가는 길도 함께 내준다. 물어놓고 '그만두기'만 주면
   * 저장하러 되돌아갔다가 다시 여기로 와야 한다.
   */
  const askAndStartNew = async () => {
    if (dirty) {
      const keep = await confirm({
        title: "저장하지 않은 내용이 있습니다",
        desc: "지금 만들던 주보를 저장하고 새로 시작할까요?\n저장하지 않으면 고친 내용이 사라집니다.",
        confirmLabel: "저장하고 새로 만들기",
        cancelLabel: "그만두기",
      });
      if (!keep) return;

      const saved = await saveCurrent();
      if (!saved) {
        notify("저장하지 못했습니다. 새 주보로 넘어가지 않았습니다.", { tone: "error", sticky: true });
        return;
      }
    }

    startNew();
    router.push("/");
  };

  /** 보관함에서 바로 올리는 자리. 편집 화면과 마찬가지로 교인 전체가 보는 것이 바뀐다. */
  const askAndPublish = async (b: { id: string; serviceDate: string }) => {
    const ok = await confirm({
      title: `${formatServiceDate(b.serviceDate)} 주보를 QR에 올릴까요?`,
      desc: "올리는 즉시 QR을 찍는 교인에게 이 주보가 보입니다.\n지금 올라가 있는 주보가 있다면 그것을 대신합니다.",
      confirmLabel: "올리기",
    });
    if (!ok) return;

    if (await publishSaved(b.id)) notify("QR에 올렸습니다.", { tone: "success" });
  };

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
      <StorageMeter library={library} />

      <Section
        title="보관함"
        desc={
          showDeleteNote
            ? "저장한 주보를 다시 열어 수정하거나, 지난주 것을 복사해 새로 만들 수 있습니다. 삭제는 관리자만 할 수 있습니다."
            : "저장한 주보를 다시 열어 수정하거나, 지난주 것을 복사해 새로 만들 수 있습니다."
        }
        right={
          <Btn onClick={() => void askAndStartNew()}>새 주보 만들기</Btn>
        }
      >
        {library.length === 0 ? (
          <Hint>아직 저장한 주보가 없습니다. 작성 화면에서 저장을 누르면 여기에 쌓입니다.</Hint>
        ) : (
          <div className="flex flex-col gap-2">
            {canDelete && (
              /*
               * 고르기 줄.
               *
               * 아무것도 안 골랐을 때는 '전체 선택'만 조용히 서 있다가, 고르는 순간
               * 지우기 버튼이 나온다. 늘 빨간 버튼이 떠 있으면 목록을 훑는 내내 눈에 걸린다.
               */
              <div className="flex flex-wrap items-center gap-2 px-0.5">
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer"
                    checked={pickedList.length > 0 && pickedList.length === library.length}
                    ref={(el) => {
                      // 일부만 골랐을 때는 켜짐도 꺼짐도 아닌 표시로 둔다
                      if (el)
                        el.indeterminate =
                          pickedList.length > 0 && pickedList.length < library.length;
                    }}
                    onChange={(e) =>
                      setPicked(e.target.checked ? new Set(library.map((b) => b.id)) : new Set())
                    }
                  />
                  <span style={{ color: "var(--ui-muted)" }}>
                    {pickedList.length > 0 ? `${pickedList.length}부 선택됨` : "전체 선택"}
                  </span>
                </label>

                {pickedList.length > 0 && (
                  <>
                    <Btn
                      size="sm"
                      variant="danger"
                      disabled={removing}
                      onClick={() => void askAndRemovePicked()}
                    >
                      {removing ? "지우는 중…" : `선택한 ${pickedList.length}부 삭제`}
                    </Btn>
                    <Btn size="sm" disabled={removing} onClick={() => setPicked(new Set())}>
                      선택 해제
                    </Btn>
                  </>
                )}
              </div>
            )}

            {library.map((b) => (
              <Row
                key={b.id}
                bulletin={b}
                thumb={thumbs[b.id]}
                picked={picked.has(b.id)}
                onPick={canDelete ? () => toggle(b.id) : undefined}
                current={b.id === doc.id}
                live={!!published?.publishedAt && published.bulletinId === b.id}
                canPublish={!!published}
                onPublish={() => void askAndPublish(b)}
                onOpen={() => {
                  openSaved(b.id);
                  router.push("/");
                }}
                onDuplicate={() => {
                  duplicateSaved(b.id);
                  router.push("/");
                }}
                onRemove={canDelete ? () => void askAndRemove(b) : undefined}
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
  thumb,
  picked,
  onPick,
  current,
  live,
  canPublish,
  onPublish,
  onOpen,
  onDuplicate,
  onRemove,
}: {
  bulletin: BulletinDoc;
  /** 목록이 한 번에 받아 나눠준 썸네일 주소. 아직 안 왔거나 이미지가 없으면 undefined */
  thumb?: string;
  /** 한꺼번에 지우려고 골라둔 것인지 */
  picked: boolean;
  /** 없으면 삭제 권한이 없다는 뜻 — 고르는 칸을 아예 보이지 않는다 */
  onPick?: () => void;
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
  const [busy, setBusy] = useState(false);

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
      className="flex flex-col gap-3 rounded-xl border p-2.5 sm:flex-row sm:items-center"
      style={{
        // 골라둔 줄은 바탕으로 표시한다. 테두리로 하면 '지금 작성 중'과 구분이 안 된다.
        background: picked ? "#fff5f5" : "#fff",
        borderColor: picked
          ? "#ffc9c9"
          : current
            ? "var(--ui-accent)"
            : "var(--ui-border)",
      }}
    >
      {onPick && (
        <label className="flex shrink-0 cursor-pointer items-center self-start sm:self-center">
          <input
            type="checkbox"
            className="size-4 cursor-pointer"
            checked={picked}
            onChange={onPick}
            aria-label={`${formatServiceDate(bulletin.serviceDate)} 주보 선택`}
          />
        </label>
      )}

      <div
        className="flex h-16 w-[45px] shrink-0 items-center justify-center overflow-hidden rounded-md border"
        style={{ borderColor: "var(--ui-border)", background: "#f8f9fa" }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
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
