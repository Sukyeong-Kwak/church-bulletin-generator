"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
 * (칸이 하나뿐이라 목록이 될 것이 없는 화면은 initialOpen 으로 펴둔 채 시작한다)
 *
 * 펴는 길은 둘이다.
 *   제목 줄을 누른다
 *   미리보기에서 그 구역을 누른다 — 찾아가면서 저절로 펴진다
 *
 * 한 번 편 것은 접을 때까지 그대로 둔다. 다른 곳을 펴도 닫지 않는다 —
 * 두 곳을 견주며 고치는 일이 잦은데, 하나만 열리면 오갈 때마다 다시 펴야 한다.
 *
 * ---------------------------------------------------------------- 왜 둘로 나눠 담는가
 *
 * '하는 일'과 '지금 상태'를 한 그릇에 담으면, 상태가 바뀔 때마다 그릇 자체가 새것이 된다.
 * 칸들은 자기를 등록하려고 그 그릇을 의존성으로 잡고 있어서,
 *
 *     등록 → 상태 바뀜 → 그릇 새로 생김 → 해제 → 다시 등록 → ...
 *
 * 이 되어 끝없이 돈다(Maximum update depth exceeded). 실제로 그렇게 났다.
 * 그래서 '하는 일'은 한 번 만들고 끝까지 같은 것을 쓰고, 바뀌는 것만 따로 담는다.
 */
interface Actions {
  toggle: (key: string) => void;
  /** 칸이 스스로를 알린다. 돌려받은 것을 부르면 등록이 풀린다. */
  register: (key: string) => () => void;
  openAll: () => void;
  closeAll: () => void;
}

interface GroupState {
  open: ReadonlySet<string>;
  total: number;
}

const ActionsCtx = createContext<Actions | null>(null);
const StateCtx = createContext<GroupState | null>(null);

/** 묶음 밖에 있는 칸은 늘 펼쳐진 것으로 본다 — 감출 방법이 없는 자리이기 때문이다 */
export function useSectionActions(): Actions | null {
  return useContext(ActionsCtx);
}

export function useSectionState(): GroupState | null {
  return useContext(StateCtx);
}

export function SectionGroup({
  children,
  initialOpen,
}: {
  children: ReactNode;
  /**
   * 처음부터 펴둘 칸의 이름(Section 의 anchor, 없으면 title).
   *
   * 접혀 있는 것이 기본인 까닭은 칸이 여럿일 때 목록으로 훑히게 하려는 것이다.
   * 그런데 칸이 하나뿐인 화면에서는 그 목록이 한 줄짜리라, 들어오자마자 그 한 줄을
   * 눌러 펴는 일만 남는다 — 그 화면이 할 일이 그것 하나인데 한 번을 더 누르게 된다.
   */
  initialOpen?: readonly string[];
}) {
  // 첫 그림에서만 본다. 뒤에 값이 달라져도 사람이 접어둔 것을 도로 펴지 않는다.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initialOpen));
  const [total, setTotal] = useState(0);

  /**
   * 등록된 이름들.
   *
   * 화면을 다시 그릴 까닭이 없는 값이라 ref 에 둔다 — 상태로 두면 그것이 바뀔 때마다
   * 아래 actions 가 새것이 되어 위에 적은 그 루프로 돌아간다.
   * 개수만 따로 상태로 들고 있어 '3개 항목' 같은 표시가 따라 바뀐다.
   */
  const keys = useRef(new Set<string>());

  const actions = useMemo<Actions>(
    () => ({
      toggle: (key) =>
        setOpen((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        }),

      register: (key) => {
        keys.current.add(key);
        setTotal(keys.current.size);
        return () => {
          keys.current.delete(key);
          setTotal(keys.current.size);
        };
      },

      openAll: () => setOpen(new Set(keys.current)),
      closeAll: () => setOpen(new Set()),
    }),
    [],
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

  const state = useMemo<GroupState>(() => ({ open, total }), [open, total]);

  return (
    <ActionsCtx.Provider value={actions}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </ActionsCtx.Provider>
  );
}

/**
 * 한꺼번에 펴고 접는 줄.
 *
 * 하나씩 눌러 펴는 것이 기본이지만, 처음 쓰는 사람은 무엇이 들어 있는지 한 번은 다 봐야 한다.
 * 접을 칸이 하나도 없으면 이 줄 자체를 내놓지 않는다 — 누를 것이 없는 버튼은 군더더기다.
 */
export function SectionGroupBar() {
  const actions = useSectionActions();
  const state = useSectionState();
  if (!actions || !state || state.total === 0) return null;

  const openCount = state.open.size;
  const allOpen = openCount >= state.total;

  return (
    <div className="flex items-center gap-2 px-0.5">
      <span className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
        {openCount > 0 ? `${openCount}/${state.total}개 펼침` : `${state.total}개 항목`}
      </span>
      <Btn
        size="sm"
        variant="ghost"
        className="ml-auto"
        onClick={() => (allOpen ? actions.closeAll() : actions.openAll())}
      >
        {allOpen ? "모두 접기" : "모두 펼치기"}
      </Btn>
    </div>
  );
}
