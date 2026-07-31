"use client";

import { useState, type ReactNode } from "react";

/**
 * 좌: 입력 / 우: 미리보기 2단 레이아웃.
 * 데스크탑이 주 사용 환경이라 넓은 화면에서는 두 영역을 동시에 보여주고,
 * 태블릿·모바일에서는 한 번에 하나씩 전환해서 쓴다.
 */
export function SplitView({
  panel,
  previewToolbar,
  preview,
}: {
  panel: ReactNode;
  previewToolbar?: ReactNode;
  preview: ReactNode;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  return (
    <div className="flex h-full flex-col">
      {/* 좁은 화면 전환 */}
      <div
        className="flex shrink-0 gap-1 border-b bg-white p-2 lg:hidden"
        style={{ borderColor: "var(--ui-border)" }}
      >
        {(["edit", "preview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 rounded-lg py-2.5 text-[13px] font-bold"
            style={{
              background: tab === t ? "var(--ui-accent)" : "#f1f3f5",
              color: tab === t ? "#fff" : "var(--ui-muted)",
            }}
          >
            {t === "edit" ? "편집" : "미리보기"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div
          className={`${
            tab === "edit" ? "flex" : "hidden"
          } w-full shrink-0 flex-col gap-3 overflow-y-auto p-3 lg:flex lg:w-[430px] lg:border-r lg:p-3.5`}
          style={{ borderColor: "var(--ui-border)" }}
        >
          {panel}
        </div>

        <div
          className={`${
            tab === "preview" ? "flex" : "hidden"
          } min-h-0 min-w-0 flex-1 flex-col lg:flex`}
        >
          {previewToolbar}
          {preview}
        </div>
      </div>
    </div>
  );
}
