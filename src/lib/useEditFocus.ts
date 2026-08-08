"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EDIT_PARAM, editRoute, targetAnchor } from "./editTargets";

/** 잠깐 빛나는 시간 (ms). 눈이 따라올 만큼만 두고 지운다. */
const GLOW = 1400;

/**
 * 어느 칸으로 찾아가는 중이라고 화면에 알리는 신호.
 *
 * 받는 쪽이 둘이다.
 *   SplitView   좁은 화면이면 '편집' 쪽으로 넘긴다
 *   고정 페이지  그 칸이 다른 탭에 있으면 탭을 먼저 바꿔준다
 *
 * 아직 그려지지 않은 칸이라도 아래 reveal 이 몇 틀 더 찾아보므로,
 * 이 신호를 받고 탭을 바꾸면 그 사이에 자리가 나타나 제때 잡힌다.
 */
export const EDIT_FOCUS_EVENT = "bulletin:edit-focus";

export interface EditFocusDetail {
  target: string;
  /** 화면에서 찾을 때 쓰는 이름 (표지 글처럼 여럿이 한 칸을 쓰는 경우가 있다) */
  anchor: string;
}

/**
 * 미리보기에서 누른 자리로 데려간다.
 *
 * 두 갈래다.
 *   같은 화면   그 자리로 굴러가 빛내고 커서를 넣는다
 *   다른 화면   주소에 이름표를 실어 옮겨간 뒤, 그쪽에서 이 훅이 이어받는다
 *
 * 주소에 싣는 까닭은 새로고침·뒤로가기에도 길을 잃지 않게 하려는 것이고,
 * 찾아간 뒤에는 주소에서 지운다 — 남겨두면 그 화면에 들를 때마다 다시 빛난다.
 */
export function useEditFocus() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /** 화면에서 그 칸을 찾아 굴러가고, 빛내고, 커서를 넣는다 */
  const reveal = useCallback((target: string) => {
    const anchor = targetAnchor(target);

    // 보이지 않는 쪽(다른 탭·미리보기 화면)에 있을 수 있다. 먼저 자리를 열어달라고 알린다.
    window.dispatchEvent(
      new CustomEvent<EditFocusDetail>(EDIT_FOCUS_EVENT, { detail: { target, anchor } }),
    );

    /*
     * 화면을 옮겨온 참이면 그 칸이 아직 그려지지 않았을 수 있다.
     * 한 틀만 기다렸다가 없으면 그냥 지나가버려, 눌렀는데 아무 일도 안 일어난 것처럼 보인다.
     * 몇 틀 더 찾아본다 — 그래도 없으면 그 칸이 이 화면에 없는 것이다.
     */
    let left = 12;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-edit-target="${anchor}"]`);
      if (!el) {
        if (left-- > 0) requestAnimationFrame(find);
        return;
      }

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("edit-glow");
      setTimeout(() => el.classList.remove("edit-glow"), GLOW);

      /*
       * 커서는 첫 칸에만 넣는다.
       * 다만 굴러가는 도중에 넣으면 브라우저가 그 칸으로 화면을 다시 튕겨
       * 부드럽게 내려가던 것이 끊긴다 — 다 내려간 뒤에 넣는다.
       */
      setTimeout(() => {
        const input = el.querySelector<HTMLElement>("input, textarea, select");
        input?.focus({ preventScroll: true });
      }, 320);
    };

    requestAnimationFrame(find);
  }, []);

  /** 미리보기에서 눌렀을 때 — 같은 화면이면 그 자리로, 아니면 옮겨간다 */
  const goEdit = useCallback(
    (target: string) => {
      const route = editRoute(target);
      if (!route) return;

      if (route.href === pathname) {
        reveal(target);
        return;
      }
      router.push(`${route.href}?${EDIT_PARAM}=${encodeURIComponent(target)}`);
    },
    [pathname, router, reveal],
  );

  // 다른 화면에서 넘어온 경우 — 주소에 실려온 이름표를 이어받는다
  const asked = params.get(EDIT_PARAM);
  useEffect(() => {
    if (!asked) return;
    reveal(asked);
    // 한 번 찾아갔으면 주소에서 지운다. 남겨두면 들를 때마다 다시 빛난다.
    router.replace(pathname, { scroll: false });
  }, [asked, pathname, reveal, router]);

  return { goEdit };
}
