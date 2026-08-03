"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export function Section({
  title,
  right,
  children,
  desc,
}: {
  title: string;
  right?: ReactNode;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-xl border bg-white p-3.5"
      style={{ borderColor: "var(--ui-border)" }}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-bold">{title}</h2>
          {desc && (
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--ui-muted)" }}>
              {desc}
            </p>
          )}
        </div>
        {/* 설명이 길어도 버튼이 눌리지 않게 제 폭은 지킨다 */}
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
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
        fontSize: size === "sm" ? 11 : 13,
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
        className="shrink-0 text-[11px] font-semibold"
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
        className="shrink-0 text-right text-[11px] tabular-nums"
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
    <p className="text-[11px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
      {children}
    </p>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed"
      style={{ background: "#fff4e6", color: "#b45309" }}
    >
      {children}
    </p>
  );
}
