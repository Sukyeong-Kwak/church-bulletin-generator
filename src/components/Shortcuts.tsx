"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDoc } from "@/lib/store";
import { isPublicPath } from "@/lib/supabase/config";
import { MAKE_PATHS } from "./Nav";
import { usePopup } from "./Popup";

/**
 * 키보드로 하는 두 가지 — 되돌리기와 저장.
 *
 * 주보를 만드는 일은 글을 쓰는 일에 가깝다. 그런데 저장은 화면 오른쪽 위 버튼 하나뿐이었고,
 * 잘못 지운 광고를 되살릴 길은 '초기화'(마지막 저장으로 통째로 되돌리기)밖에 없었다 —
 * 그것은 오늘 한 일을 전부 버리는 것이라, 한 칸을 되살리자고 쓸 수 있는 것이 아니다.
 *
 *   Cmd/Ctrl+Z        한 걸음 되돌리기
 *   Shift+Cmd/Ctrl+Z  다시 앞으로 (Ctrl+Y 도 같다 — 윈도우에서 손에 익은 자리다)
 *   Cmd/Ctrl+S        저장
 *
 * ---------------------------------------------------------------- 글상자 안에서도 가로챈다
 *
 * 브라우저에도 제 되돌리기가 있어서, 글상자 안에서는 그쪽에 맡기는 것이 예의처럼 보인다.
 * 그런데 이 화면의 글상자는 값을 React 가 쥐고 있어(제어 컴포넌트) 브라우저가 되돌려 놓아도
 * 다음 렌더에 도로 덮인다 — 눌러도 아무 일이 없거나 글자가 튄다. 그리고 주보 쪽 되돌리기는
 * 어차피 그 글상자의 내용까지 함께 되돌린다. 그래서 이 화면에서는 우리 것 하나로 모은다.
 *
 * 다만 창이 떠 있는 동안(data-modal)은 물러선다. 광고 붙여넣기의 원문 상자는 주보가 아니라
 * 그 창의 것이라, 거기서 Cmd+Z 를 누른 사람이 되돌리려는 것은 주보가 아니다.
 *
 * 같은 까닭으로 되돌리기는 주보를 고치는 네 화면에서만 듣는다. 보관함의 찾는 칸에서
 * Cmd+Z 를 누르면 되돌아가야 하는 것은 그 칸의 글자다 — 거기서 주보를 되돌리면
 * 화면에는 아무 일도 없는데 보이지 않는 곳의 고친 것 하나가 조용히 물러난다.
 * 저장은 다르다. 어느 화면에 있든 저장할 것은 만들던 그 주보 하나뿐이다.
 */
export function Shortcuts() {
  const path = usePathname();
  const { undo, redo, saveCurrent, dirty, loaded } = useDoc();
  const { notify } = usePopup();

  useEffect(() => {
    // 로그인·가입 화면에는 되돌릴 주보도 저장할 주보도 없다
    if (!loaded || isPublicPath(path) || path === "/pending" || path === "/now") return;

    const onKey = (e: KeyboardEvent) => {
      const hot = e.metaKey || e.ctrlKey;
      if (!hot || e.altKey) return;
      if (document.querySelector("[data-modal]")) return;

      const key = e.key.toLowerCase();

      if (key === "z" || (key === "y" && !e.shiftKey)) {
        if (!MAKE_PATHS.includes(path)) return;
        e.preventDefault();
        // 윈도우에서는 Ctrl+Y 도 '다시 앞으로'다 — 손에 익은 자리라 함께 받는다
        if (key === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "s" && !e.shiftKey) {
        e.preventDefault();
        // 고친 것이 없으면 아무 말도 하지 않는다 — 저장할 것이 없다는 안내가 더 성가시다
        if (!dirty) return;
        void saveCurrent().then((ok) => {
          if (ok) notify("저장했습니다.", { tone: "success" });
          else
            notify("저장하지 못했습니다.\n인터넷 연결을 확인한 뒤 다시 눌러주세요.", {
              tone: "error",
              sticky: true,
            });
        });
      }
    };

    // 캡처 단계에서 받는다. 글상자가 먼저 먹고 브라우저 기본 동작으로 넘어가는 것을 막는다.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [path, loaded, dirty, undo, redo, saveCurrent, notify]);

  return null;
}
