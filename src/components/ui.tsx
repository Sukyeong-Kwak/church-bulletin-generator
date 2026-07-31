"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

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
        <div>
          <h2 className="text-[13px] font-bold">{title}</h2>
          {desc && (
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--ui-muted)" }}>
              {desc}
            </p>
          )}
        </div>
        {right}
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

/** 라벨·값·슬라이더가 한 줄에 들어가는 조절기. 좁은 패널에서도 폭을 넘지 않는다. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2" style={{ opacity: disabled ? 0.4 : 1 }}>
      <span
        className="shrink-0 text-[11px] font-semibold"
        style={{ color: "var(--ui-muted)", width: 56 }}
      >
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span
        className="shrink-0 text-right text-[11px] tabular-nums"
        style={{ color: "var(--ui-text)", width: 34 }}
      >
        {value}
      </span>
    </label>
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
