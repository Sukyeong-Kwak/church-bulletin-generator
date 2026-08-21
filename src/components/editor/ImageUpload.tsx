"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS } from "@/lib/layout";
import { getBackend } from "@/lib/backend";
import { attachWebCopy, URL_TTL } from "@/lib/backend/images";
import { readImageSize } from "@/lib/imageStore";
import { Btn, Hint } from "../ui";

interface Props {
  label: string;
  /** IndexedDB 키 */
  value?: string;
  onChange: (key: string | undefined) => void;
  prefix: string;
  /** 권장 해상도 안내를 표시할지 */
  checkResolution?: boolean;
}

/**
 * 원본 화질을 그대로 보관한다. 내보내기는 이 원본을 쓴다.
 * 화면에 그릴 때 쓸 축소본은 그 옆에 한 벌 더 둔다 — 원본을 건드리지는 않는다.
 */
export function ImageUpload({ label, value, onChange, prefix, checkResolution }: Props) {
  const [url, setUrl] = useState<string>();
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * 여기서는 원본 주소를 받는다.
   *
   * 옆에 적어주는 해상도는 '내보낼 때 이 그림이 버텨줄까'를 묻는 값이라 원본의 것이어야 한다.
   * 축소본을 재면 어떤 그림을 올려도 1400px로 나와 늘 낮다고 나온다.
   *
   * 다만 파일을 통째로 받지는 않는다 — 주소만 받아 <img>에 걸면 브라우저가 받아 캐시에 남기고,
   * 다른 화면으로 갔다 와도 다시 받지 않는다.
   */
  /** 지금 화면이 쓰고 있는 주소 — 새것이 자리 잡은 뒤에 옛것을 거둔다 */
  const held = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    const backend = getBackend();

    (async () => {
      const [got] = value ? await backend.imageUrls([value], URL_TTL.edit) : [null];
      if (!alive) {
        backend.releaseUrls([got]);
        return;
      }

      const previous = held.current;
      held.current = got;
      setUrl(got ?? undefined);
      // 그림을 교체하는 순간 옛 주소를 먼저 거두면, 새것이 올 때까지 자리가 비어 보인다
      backend.releaseUrls([previous]);

      if (!got) {
        setSize(undefined);
        return;
      }
      try {
        setSize(await readImageSize(got));
      } catch {
        setSize(undefined);
      }
    })();

    return () => {
      alive = false;
    };
  }, [value]);

  // 화면을 떠날 때 마지막 하나를 거둔다
  useEffect(() => {
    return () => {
      getBackend().releaseUrls([held.current]);
      held.current = null;
    };
  }, []);

  // 이전 이미지는 지우지 않는다. 보관함의 지난 주보가 같은 이미지를 가리키고 있을 수 있다.
  const pick = async (file: File) => {
    setUploading(true);
    try {
      const backend = getBackend();
      const key = await backend.putImage(file, prefix);

      /*
       * 원본 옆에 화면용 축소본을 둔다.
       *
       * 배경으로 올리는 것은 대개 폰으로 찍은 사진이라 4000px에 몇 MB다. 미리보기는 그것을
       * 페이지마다 한 장씩 그리는데, 화면에 나오는 크기는 300px 남짓이다.
       *
       * 이미 작은 것과 뒤가 비치는 것(로고 같은 PNG)은 makeWebCopy 가 알아서 거른다 —
       * 여기서 쓰임새로 가리지 않는다. 비치는 PNG를 배경으로 올리는 일도 있기 때문이다.
       */
      await attachWebCopy(backend, key, file);
      onChange(key);
    } catch {
      setUploadError("이미지를 올리지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setUploading(false);
    }
  };

  const tooSmall =
    checkResolution && size ? size.width < CANVAS.w * 2 || size.height < CANVAS.h * 2 : false;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
          {label}
        </span>
        {size && (
          <span className="text-[10px]" style={{ color: "var(--ui-muted)" }}>
            {size.width}×{size.height}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--ui-border)", background: "#f8f9fa" }}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px]" style={{ color: "var(--ui-muted)" }}>
              없음
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          <Btn size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "올리는 중…" : value ? "교체" : "업로드"}
          </Btn>
          {value && (
            <Btn size="sm" variant="danger" onClick={() => onChange(undefined)}>
              제거
            </Btn>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = "";
          }}
        />
      </div>

      {uploadError && (
        <p className="mt-1.5 text-[11px]" style={{ color: "#c92a2a" }}>
          {uploadError}
        </p>
      )}
      {tooSmall && (
        <p className="mt-1.5 text-[11px]" style={{ color: "#b45309" }}>
          해상도가 낮습니다. 고화질로 내보내려면 {CANVAS.w * 2}×{CANVAS.h * 2} 이상을 권장합니다.
        </p>
      )}
      {!value && checkResolution && (
        <div className="mt-1.5">
          <Hint>밴드에 올라온 날짜 없는 배경 중 가장 큰 파일을 올리세요.</Hint>
        </div>
      )}
    </div>
  );
}
