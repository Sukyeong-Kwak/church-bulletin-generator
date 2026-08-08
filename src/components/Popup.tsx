"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Btn } from "./ui";

/**
 * 화면 가운데에 뜨는 안내와 확인창.
 *
 * 브라우저의 alert·confirm을 쓰지 않는다. 그것들은 탭 전체를 멈춰 세우고,
 * 생김새를 손댈 수 없어 주소가 함께 뜬다 — 교인에게 보여줄 화면에 어울리지 않는다.
 *
 * 두 가지가 필요하다.
 *   안내(notify)  잘못 눌렀거나 조건이 안 맞을 때 알려주고 스스로 사라진다
 *   확인(confirm) 되돌리기 어려운 일 앞에서 한 번 더 묻고, 답을 받아야 넘어간다
 *
 * 안내는 눌러야 사라지게 할 수도 있다(sticky). 반드시 읽어야 하는 말은
 * 손이 바쁜 사이에 스쳐 지나가면 안 된다.
 */

export type Tone = "info" | "success" | "warn" | "error";

export interface NotifyOptions {
  tone?: Tone;
  /** 참이면 스스로 사라지지 않는다 — '확인'을 눌러야 닫힌다 */
  sticky?: boolean;
}

export interface ConfirmOptions {
  title: string;
  /** 무슨 일이 벌어지는지. 되돌릴 수 있는지 없는지를 여기에 적는다. */
  desc?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger면 확인 버튼이 붉어진다 — 지우거나 막는 일 */
  tone?: "default" | "danger";
}

/**
 * 스스로 사라지기까지 (ms).
 * 잘못됐다는 말은 읽는 데 시간이 더 걸리고, 잘됐다는 말은 눈에 스치기만 해도 된다.
 */
const LIFE: Record<Tone, number> = {
  success: 2200,
  info: 2800,
  warn: 4200,
  error: 5200,
};

const SKIN: Record<Tone, { bg: string; fg: string; bd: string; mark: string }> = {
  success: { bg: "#f4fcf6", fg: "#1e6b32", bd: "#b2f2bb", mark: "✓" },
  info: { bg: "#ffffff", fg: "var(--ui-text)", bd: "var(--ui-border)", mark: "" },
  warn: { bg: "#fff9db", fg: "#8a6100", bd: "#ffe8a3", mark: "!" },
  error: { bg: "#fff5f5", fg: "#c92a2a", bd: "#ffc9c9", mark: "!" },
};

interface Note {
  id: number;
  text: string;
  tone: Tone;
  sticky: boolean;
}

interface Asked {
  opts: ConfirmOptions;
  settle: (ok: boolean) => void;
}

interface PopupApi {
  notify: (text: string, options?: NotifyOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const PopupCtx = createContext<PopupApi | null>(null);

/**
 * 팝업을 띄우는 손잡이.
 *
 * PopupProvider 밖에서 부르면 아무 일도 하지 않는 손잡이를 돌려준다.
 * 안내 하나 때문에 화면이 통째로 죽는 것보다는, 안내가 안 뜨는 편이 낫다.
 * (confirm은 '아니오'로 답한다 — 못 물어봤으면 하지 않는 것이 맞다)
 */
export function usePopup(): PopupApi {
  const api = useContext(PopupCtx);
  return (
    api ?? {
      notify: () => {},
      confirm: async () => false,
    }
  );
}

export function PopupProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [asked, setAsked] = useState<Asked>();
  const seq = useRef(0);

  const drop = useCallback((id: number) => {
    setNotes((list) => list.filter((n) => n.id !== id));
  }, []);

  const api = useMemo<PopupApi>(
    () => ({
      notify: (text, options) => {
        const tone = options?.tone ?? "info";
        seq.current += 1;
        const note: Note = { id: seq.current, text, tone, sticky: !!options?.sticky };
        // 같은 말이 연달아 쌓이지 않게 한다 — 버튼을 두 번 누른 것뿐인데 두 줄이 서면 고장으로 읽힌다
        setNotes((list) => [...list.filter((n) => n.text !== text), note]);
      },
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setAsked({ opts: options, settle: resolve });
        }),
    }),
    [],
  );

  return (
    <PopupCtx.Provider value={api}>
      {children}
      <NoteLayer notes={notes} onClose={drop} />
      {asked && (
        <ConfirmLayer
          opts={asked.opts}
          onSettle={(ok) => {
            asked.settle(ok);
            setAsked(undefined);
          }}
        />
      )}
    </PopupCtx.Provider>
  );
}

/* ---------------------------------------------------------------- 안내 */

function NoteLayer({ notes, onClose }: { notes: Note[]; onClose: (id: number) => void }) {
  if (notes.length === 0) return null;

  // 스스로 사라지는 안내는 손가락을 막지 않는다.
  // 화면 한가운데 떠 있는 동안에도 그 아래 버튼을 그대로 누를 수 있어야 한다.
  const blocking = notes.some((n) => n.sticky);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{
        pointerEvents: blocking ? "auto" : "none",
        background: blocking ? "rgba(16,18,22,0.28)" : "transparent",
      }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-2">
        {/*
          onClose 를 그 자리에서 만들어 넘기지 않는다.
          그러면 위에서 한 번 다시 그려질 때마다 새 함수가 되어 아래 타이머가 처음부터 다시 세고,
          자주 그려지는 화면에서는 안내가 영영 사라지지 않는다.
        */}
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}

function NoteCard({ note, onClose }: { note: Note; onClose: (id: number) => void }) {
  const skin = SKIN[note.tone];
  const close = useCallback(() => onClose(note.id), [onClose, note.id]);

  useEffect(() => {
    if (note.sticky) return;
    const timer = setTimeout(close, LIFE[note.tone]);
    return () => clearTimeout(timer);
  }, [note.sticky, note.tone, close]);

  return (
    <div
      // 스스로 사라지는 것은 읽기만 하면 되므로 status, 눌러야 하는 것은 답을 기다리므로 alert
      role={note.sticky ? "alertdialog" : "status"}
      aria-live={note.sticky ? "assertive" : "polite"}
      className="popup-pop w-full rounded-xl border px-4 py-3 text-center shadow-lg"
      style={{
        background: skin.bg,
        borderColor: skin.bd,
        color: skin.fg,
        pointerEvents: "auto",
      }}
    >
      <p className="text-[13px] leading-relaxed font-semibold whitespace-pre-line">
        {skin.mark && <span className="mr-1">{skin.mark}</span>}
        {note.text}
      </p>

      {note.sticky && (
        <Btn
          variant="primary"
          autoFocus
          onClick={close}
          className="mt-3"
          style={{ padding: "7px 22px" }}
        >
          확인
        </Btn>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 확인창 */

function ConfirmLayer({
  opts,
  onSettle,
}: {
  opts: ConfirmOptions;
  onSettle: (ok: boolean) => void;
}) {
  const danger = opts.tone === "danger";

  /**
   * Esc로 물러설 수 있어야 한다. 답하지 않고 빠져나온 것은 '아니오'다.
   *
   * 잡는 단계(capture)에서 받아 그 자리에서 끊는다.
   * 이 확인창은 다른 창 위에 뜨는 일이 잦은데(광고 붙여넣기 창이 그렇다),
   * 그냥 두면 Esc 한 번에 확인창과 그 아래 창이 함께 닫혀
   * 붙여넣고 다듬어둔 것이 통째로 날아간다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onSettle(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onSettle]);

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      style={{ background: "rgba(16,18,22,0.38)" }}
      // 바깥을 눌러도 물러선다. 실수로 띄웠을 때 빠져나갈 길이 여럿이어야 한다.
      onClick={() => onSettle(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="popup-pop w-full max-w-sm rounded-2xl border bg-white p-5 shadow-xl"
        style={{ borderColor: "var(--ui-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[15px] font-bold" style={{ color: "var(--ui-text)" }}>
          {opts.title}
        </p>

        {opts.desc && (
          <p
            className="mt-2 text-[12.5px] leading-relaxed whitespace-pre-line"
            style={{ color: "var(--ui-muted)" }}
          >
            {opts.desc}
          </p>
        )}

        {/*
          무르는 쪽을 왼쪽에 둔다.
          되돌리기 어려운 일 앞에서는 손이 먼저 닿는 자리가 '그만두기'여야 한다.
        */}
        <div className="mt-4 flex justify-end gap-2">
          <Btn onClick={() => onSettle(false)} style={{ padding: "8px 16px" }}>
            {opts.cancelLabel ?? "취소"}
          </Btn>
          <Btn
            variant={danger ? "danger" : "primary"}
            autoFocus
            onClick={() => onSettle(true)}
            style={{ padding: "8px 16px" }}
          >
            {opts.confirmLabel ?? "확인"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
