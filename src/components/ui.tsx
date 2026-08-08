"use client";

import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { useSectionActions, useSectionState } from "./SectionGroup";

export function Section({
  title,
  right,
  children,
  desc,
  anchor,
}: {
  title: string;
  right?: ReactNode;
  desc?: string;
  children: ReactNode;
  /**
   * 미리보기에서 이 칸으로 찾아올 때 쓰는 이름표 (lib/editTargets).
   * 주보의 어느 구역을 눌렀을 때 굴러와 잠깐 빛나는 자리가 된다.
   */
  anchor?: string;
}) {
  /* 이름표가 있으면 그것을 열쇠로 쓴다 — 미리보기에서 찾아올 때와 같은 이름이라야 열린다 */
  const key = anchor ?? title;

  /*
   * 등록은 '하는 일' 쪽에만 기댄다. 그쪽은 처음 한 번 만들어지고 끝까지 같은 것이라
   * 이 효과가 다시 돌지 않는다 — 상태까지 함께 잡으면 등록과 해제가 끝없이 되풀이된다.
   */
  const actions = useSectionActions();
  const state = useSectionState();
  const open = state ? state.open.has(key) : true;

  useEffect(() => actions?.register(key), [actions, key]);

  return (
    <section
      data-edit-target={anchor}
      className="rounded-xl border bg-white"
      style={{ borderColor: "var(--ui-border)" }}
    >
      {/*
        제목 줄이 곧 여는 손잡이다.
        접혀 있을 때 이 줄만 남으므로, 왼쪽이 '무엇을 고칠 수 있는가'의 목록이 된다.
      */}
      <div
        className="flex items-start gap-2 px-3.5 py-3"
        style={{ background: open ? "#fcfcfd" : undefined }}
      >
        <button
          type="button"
          onClick={() => actions?.toggle(key)}
          disabled={!actions}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {/* 훑을 때 눈이 걸리는 자리 — 펴져 있으면 색이 살고, 접히면 물러난다 */}
          <span
            aria-hidden
            className="mt-[5px] h-[16px] w-[3px] shrink-0 rounded-full transition-colors"
            style={{ background: open ? "var(--ui-accent)" : "var(--ui-border)" }}
          />
          <span className="min-w-0">
            <span className="block text-[17px] leading-tight font-bold">{title}</span>
            {/* 설명은 펴져 있을 때만. 접힌 목록은 제목만 있어야 한눈에 훑힌다. */}
            {desc && open && (
              <span
                className="mt-1.5 block text-[12px] leading-relaxed"
                style={{ color: "var(--ui-muted)" }}
              >
                {desc}
              </span>
            )}
          </span>
          {actions && (
            <span
              aria-hidden
              className="mt-[3px] ml-auto shrink-0 text-[11px] transition-transform"
              style={{ color: "var(--ui-muted)", transform: open ? "rotate(90deg)" : undefined }}
            >
              ▶
            </span>
          )}
        </button>

        {/* 설명이 길어도 버튼이 눌리지 않게 제 폭은 지킨다 */}
        {right && open && <div className="shrink-0">{right}</div>}
      </div>

      {open && (
        <div className="border-t px-3.5 pt-3 pb-3.5" style={{ borderColor: "var(--ui-border)" }}>
          {children}
        </div>
      )}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold" style={{ color: "var(--ui-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "default" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Btn({ variant = "default", size = "md", style, className, ...rest }: BtnProps) {
  const palette = {
    primary: { background: "var(--ui-accent)", color: "#fff", border: "1px solid var(--ui-accent)" },
    default: { background: "#fff", color: "var(--ui-text)", border: "1px solid var(--ui-border)" },
    ghost: { background: "transparent", color: "var(--ui-muted)", border: "1px solid transparent" },
    danger: { background: "#fff", color: "#c92a2a", border: "1px solid #ffc9c9" },
  }[variant];

  return (
    <button
      {...rest}
      className={className}
      style={{
        ...palette,
        borderRadius: 8,
        padding: size === "sm" ? "4px 8px" : "7px 12px",
        // 작은 버튼도 11px 아래로 두지 않는다 — 한글은 그 크기에서 획이 뭉갠다
        fontSize: size === "sm" ? 12 : 13,
        fontWeight: 600,
        whiteSpace: "nowrap",
        opacity: rest.disabled ? 0.5 : 1,
        ...style,
      }}
    />
  );
}

/** 슬라이더의 라벨·값 칸 폭. 밑에 눈금 글씨를 나란히 놓을 때도 이 값을 쓴다. */
export const SLIDER_LABEL_W = 56;
export const SLIDER_VALUE_W = 34;

/** 라벨·값·슬라이더가 한 줄에 들어가는 조절기. 좁은 패널에서도 폭을 넘지 않는다. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  track,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  /** 고를 수 있는 것이 색이면, 그 색들을 막대 자체에 깔아 보여준다 */
  track?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2" style={{ opacity: disabled ? 0.4 : 1 }}>
      <span
        className="shrink-0 text-[12px] font-semibold"
        style={{ color: "var(--ui-muted)", width: SLIDER_LABEL_W }}
      >
        {label}
      </span>
      <input
        type="range"
        className={track ? "swatch" : undefined}
        style={track ? ({ "--track": track } as CSSProperties) : undefined}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="shrink-0 text-right text-[12px] tabular-nums"
        style={{ color: "var(--ui-text)", width: SLIDER_VALUE_W }}
      >
        {format ? format(value) : value}
      </span>
    </label>
  );
}

/** 슬라이더 양 끝이 무엇인지 알려주는 눈금 글씨. 위 슬라이더의 막대와 자리를 맞춘다. */
export function SliderEnds({ left, right }: { left: string; right: string }) {
  return (
    <div
      className="flex justify-between text-[10px]"
      style={{
        color: "var(--ui-muted)",
        paddingLeft: SLIDER_LABEL_W + 8,
        paddingRight: SLIDER_VALUE_W + 8,
      }}
    >
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
      {children}
    </p>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-lg px-2.5 py-2 text-[12px] leading-relaxed"
      style={{ background: "#fff4e6", color: "#b45309" }}
    >
      {children}
    </p>
  );
}
