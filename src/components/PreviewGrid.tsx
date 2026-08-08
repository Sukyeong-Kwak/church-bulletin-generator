"use client";

import { editRoute } from "@/lib/editTargets";
import { CANVAS } from "@/lib/layout";
import type { BulletinDoc, LaidOutPage } from "@/lib/types";
import { BulletinPage } from "./BulletinPage";

interface Props {
  doc: BulletinDoc;
  pages: LaidOutPage[];
  urls: { background?: string; cover?: string; logo?: string };
  /** 미리보기 축소 배율 */
  scale: number;
  /** 내보내기용 노드 등록 — 축소는 부모 transform으로만 하므로 원본 크기 그대로 캡처된다 */
  registerRef?: (index: number, el: HTMLDivElement | null) => void;
  onSelectPage?: (page: LaidOutPage) => void;
  /** 주보의 한 구역을 눌렀을 때 — 그것을 고치는 자리로 데려간다 */
  onEdit?: (target: string) => void;
  selectedIndex?: number;
  /**
   * 쪽 아래 설명줄('1 표지 고정')을 보일지.
   *
   * 만드는 쪽에서는 어디를 고쳐야 하는지 알려주는 표지판이지만, 보는 쪽에서는
   * 읽을 것도 누를 것도 아닌 군더더기다. 순서대로 이어지기만 하면 된다.
   */
  showCaption?: boolean;
}

export function PreviewGrid({
  doc,
  pages,
  urls,
  scale,
  registerRef,
  onSelectPage,
  onEdit,
  selectedIndex,
  showCaption = true,
}: Props) {
  return (
    <div className="flex flex-wrap gap-4">
      {pages.map((page) => (
        <div key={page.index} className="flex flex-col gap-1.5">
          <div
            onClick={(e) => {
              /*
               * 눌린 자리가 고칠 수 있는 구역인지 안쪽부터 훑어 올라간다.
               * closest 라서 겹쳐 있어도 가장 안쪽 것이 잡힌다 —
               * 생일 명단을 눌렀는데 청년부 일정 장 전체가 잡히는 일이 없다.
               */
              const hit = (e.target as Element | null)?.closest?.("[data-edit]");
              const target = hit?.getAttribute("data-edit");
              if (onEdit && target) {
                onEdit(target);
                return;
              }
              onSelectPage?.(page);
            }}
            className="relative overflow-hidden rounded-lg border bg-white"
            style={{
              width: CANVAS.w * scale,
              height: CANVAS.h * scale,
              borderColor:
                selectedIndex === page.index ? "var(--ui-accent)" : "var(--ui-border)",
              boxShadow:
                selectedIndex === page.index ? "0 0 0 2px #dbe4ff" : "0 1px 2px rgba(0,0,0,.05)",
              cursor: onSelectPage || onEdit ? "pointer" : "default",
            }}
          >
            <div
              className={onEdit ? "page-scale editable" : "page-scale"}
            // 어느 화면 어느 칸이 맡는지 그 자리에서 알려준다 — 눌러보기 전에 알 수 있어야 한다
            onMouseOver={
              onEdit
                ? (e) => {
                    const hit = (e.target as Element | null)?.closest?.("[data-edit]");
                    if (!(hit instanceof HTMLElement) || hit.title) return;
                    const route = editRoute(hit.dataset.edit ?? "");
                    if (route) hit.title = `${route.label}에서 고칩니다`;
                  }
                : undefined
            }
              style={{ transform: `scale(${scale})`, width: CANVAS.w, height: CANVAS.h }}
            >
              <div ref={(el) => registerRef?.(page.index, el)}>
                <BulletinPage
                  doc={doc}
                  page={page}
                  backgroundUrl={urls.background}
                  coverUrl={urls.cover}
                  logoUrl={urls.logo}
                />
              </div>
            </div>
          </div>

          {showCaption && (
            <div
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: "var(--ui-muted)" }}
            >
              <span className="font-semibold">{page.index + 1}</span>
              <span>{pageLabel(page)}</span>
              {(page.kind === "cover" || page.kind === "worship") && (
                <span
                  className="rounded px-1.5 py-0.5"
                  style={{ background: "#f1f3f5", color: "var(--ui-muted)" }}
                  title="고정 페이지 관리에서 수정합니다"
                >
                  고정
                </span>
              )}
              {page.overflow && (
                <span
                  className="rounded px-1.5 py-0.5 font-semibold"
                  style={{ background: "#fff4e6", color: "#b45309" }}
                  title="블록 하나가 한 페이지보다 큽니다. 폰트 크기를 줄이거나 내용을 나눠주세요."
                >
                  넘침
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function pageLabel(page: LaidOutPage): string {
  if (page.kind === "cover") return "표지";
  if (page.kind === "worship") return "청년부 일정";
  const kinds = new Set(page.blocks.map((b) => b.kind));
  const names: string[] = [];
  if (kinds.has("ad")) names.push("광고");
  if (kinds.has("schedule")) names.push("주요일정");
  if (kinds.has("sermon")) names.push("본문 말씀");
  return names.join(" · ") || "빈 페이지";
}
