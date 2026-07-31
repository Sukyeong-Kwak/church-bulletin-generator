"use client";

import { useEffect, useRef, useState } from "react";
import { CANVAS } from "@/lib/layout";
import { getImage, readImageSize, storeFile } from "@/lib/imageStore";
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

/** 원본 화질을 그대로 보관한다. 축소·재압축하지 않는다. */
export function ImageUpload({ label, value, onChange, prefix, checkResolution }: Props) {
  const [url, setUrl] = useState<string>();
  const [size, setSize] = useState<{ width: number; height: number }>();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    let created: string | undefined;
    (async () => {
      if (!value) {
        setUrl(undefined);
        setSize(undefined);
        return;
      }
      const blob = await getImage(value);
      if (!blob || !alive) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
      try {
        setSize(await readImageSize(created));
      } catch {
        setSize(undefined);
      }
    })();
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [value]);

  // 이전 이미지는 지우지 않는다. 보관함의 지난 주보가 같은 이미지를 가리키고 있을 수 있다.
  const pick = async (file: File) => {
    onChange(await storeFile(file, prefix));
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
          <Btn size="sm" onClick={() => inputRef.current?.click()}>
            {value ? "교체" : "업로드"}
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
