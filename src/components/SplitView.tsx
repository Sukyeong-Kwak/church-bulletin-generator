"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EDIT_FOCUS_EVENT } from "@/lib/useEditFocus";
import { SectionGroup, SectionGroupBar } from "./SectionGroup";

/**
 * 좌: 입력 / 우: 미리보기 2단 레이아웃.
 * 데스크탑이 주 사용 환경이라 넓은 화면에서는 두 영역을 동시에 보여주고,
 * 태블릿·모바일에서는 한 번에 하나씩 전환해서 쓴다.
 */
export function SplitView({
  panel,
  previewToolbar,
  preview,
  openByDefault,
}: {
  panel: ReactNode;
  previewToolbar?: ReactNode;
  preview: ReactNode;
  /** 들어오자마자 펴둘 칸의 이름 (Section 의 anchor, 없으면 title) */
  openByDefault?: readonly string[];
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  /*
   * 좁은 화면에서는 편집과 미리보기가 한 번에 하나만 보인다.
   * 미리보기에서 어느 구역을 눌러 고치러 갈 때, 넘어가 주지 않으면
   * 굴러가고 빛나는 일이 보이지 않는 쪽에서 벌어진다.
   */
  useEffect(() => {
    const toEdit = () => setTab("edit");
    window.addEventListener(EDIT_FOCUS_EVENT, toEdit);
    return () => window.removeEventListener(EDIT_FOCUS_EVENT, toEdit);
  }, []);

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
          } w-full shrink-0 flex-col gap-4 overflow-y-auto p-3 lg:flex lg:w-[470px] lg:border-r lg:p-3.5`}
          style={{ borderColor: "var(--ui-border)" }}
        >
          {/*
            칸을 접었다 폈다 하는 일은 세 화면이 똑같이 한다.
            여기서 한 번 감싸두면 화면마다 따로 챙길 것이 없다.
          */}
          <SectionGroup initialOpen={openByDefault}>
            <SectionGroupBar />
            {panel}
          </SectionGroup>
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
