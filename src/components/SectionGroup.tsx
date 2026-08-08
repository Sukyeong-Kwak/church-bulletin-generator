"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { EDIT_FOCUS_EVENT, type EditFocusDetail } from "@/lib/useEditFocus";
import { Btn } from "./ui";

/**
 * 왼쪽 칸들을 접었다 폈다 하는 자리.
 *
 * 처음에는 모두 접혀 있다. 그러면 왼쪽이 '무엇을 고칠 수 있는가'의 목록이 되어,
 * 굴리지 않고도 이 화면이 맡는 일이 한눈에 들어온다.
 * 예닐곱 개가 모두 펼쳐진 채 쌓여 있던 것이 원래 문제였다.
 *
 * 펴는 길은 둘이다.
 *   제목 줄을 누른다
 *   미리보기에서 그 구역을 누른다 — 찾아가면서 저절로 펴진다
 *
 * 한 번 편 것은 접을 때까지 그대로 둔다. 다른 곳을 펴도 닫지 않는다 —
 * 두 곳을 견주며 고치는 일이 잦은데, 하나만 열리면 오갈 때마다 다시 펴야 한다.
 */
interface SectionGroupApi {
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
  register: (key: string) => () => void;
  openAll: () => void;
  closeAll: () => void;
  total: number;
  openCount: number;
}

const Ctx = createContext<SectionGroupApi | null>(null);

/** 묶음 밖에 있는 칸은 늘 펼쳐진 것으로 본다 — 감출 방법이 없는 자리이기 때문이다 */
export function useSectionGroup(): SectionGroupApi | null {
  return useContext(Ctx);
}

export function SectionGroup({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState<Set<string>>(() => new Set());

  const register = useCallback((key: string) => {
    setAll((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    return () => {
      setAll((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    };
  }, []);

  const api = useMemo<SectionGroupApi>(
    () => ({
      isOpen: (key) => open.has(key),
      toggle: (key) =>
        setOpen((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        }),
      register,
      openAll: () => setOpen(new Set(all)),
      closeAll: () => setOpen(new Set()),
      total: all.size,
      openCount: open.size,
    }),
    [open, all, register],
  );

  // 미리보기에서 어느 구역을 눌러 찾아오는 중이면, 그 칸을 미리 펴 둔다
  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<EditFocusDetail>).detail;
      if (!detail?.anchor) return;
      setOpen((prev) => (prev.has(detail.anchor) ? prev : new Set(prev).add(detail.anchor)));
    };
    window.addEventListener(EDIT_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(EDIT_FOCUS_EVENT, onFocus);
  }, []);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * 한꺼번에 펴고 접는 줄.
 *
 * 하나씩 눌러 펴는 것이 기본이지만, 처음 쓰는 사람은 무엇이 들어 있는지 한 번은 다 봐야 한다.
 * 접을 칸이 하나도 없으면 이 줄 자체를 내놓지 않는다 — 누를 것이 없는 버튼은 군더더기다.
 */
export function SectionGroupBar() {
  const group = useSectionGroup();
  if (!group || group.total === 0) return null;

  const allOpen = group.openCount >= group.total;

  return (
    <div className="flex items-center gap-2 px-0.5">
      <span className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
        {group.openCount > 0 ? `${group.openCount}/${group.total}개 펼침` : `${group.total}개 항목`}
      </span>
      <Btn
        size="sm"
        variant="ghost"
        className="ml-auto"
        onClick={() => (allOpen ? group.closeAll() : group.openAll())}
      >
        {allOpen ? "모두 접기" : "모두 펼치기"}
      </Btn>
    </div>
  );
}
