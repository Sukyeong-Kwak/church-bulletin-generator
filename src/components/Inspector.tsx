"use client";

import type { CSSProperties, ReactNode } from "react";
import { DEFAULT_STYLES, FONTS, FONT_SIZE, resolveStyle, roleFontKey, type Role } from "@/lib/layout";
import type { Align, TextStyle, Theme } from "@/lib/types";
import { Btn } from "./ui";

interface Props {
  label: string;
  role: Role;
  theme: Theme;
  value?: TextStyle;
  onChange: (next: TextStyle | undefined) => void;
}

/**
 * 스타일 오버라이드 인스펙터.
 * 아무것도 건드리지 않으면 기본값이 그대로 적용되고, 수정한 항목만 저장된다.
 * ↺ 를 누르면 해당 항목을 지워 기본값으로 돌아간다.
 */
export function Inspector({ label, role, theme, value, onChange }: Props) {
  const base = DEFAULT_STYLES[role];
  const cur = resolveStyle(role, theme, value);
  const has = (k: keyof TextStyle) => value?.[k] !== undefined;

  function set<K extends keyof TextStyle>(k: K, v: TextStyle[K] | undefined) {
    const next: TextStyle = { ...(value ?? {}) };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(Object.keys(next).length ? next : undefined);
  }

  const modified = value !== undefined && Object.keys(value).length > 0;

  return (
    <div className="rounded-xl border bg-white p-3" style={{ borderColor: "var(--ui-border)" }}>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12px] font-bold">{label}</span>
        <Btn
          size="sm"
          variant="ghost"
          disabled={!modified}
          onClick={() => onChange(undefined)}
          title="이 요소의 모든 수정을 취소하고 기본값으로"
        >
          ↺ 기본값으로
        </Btn>
      </div>

      <Row label="정렬" modified={has("align")} onReset={() => set("align", undefined)}>
        <div className="flex gap-1">
          {(["left", "center", "right"] as Align[]).map((a) => (
            <Btn
              key={a}
              size="sm"
              variant={cur.textAlign === a ? "primary" : "default"}
              onClick={() => set("align", a)}
            >
              {a === "left" ? "좌" : a === "center" ? "중앙" : "우"}
            </Btn>
          ))}
        </div>
      </Row>

      <Row label="글꼴" modified={has("font")} onReset={() => set("font", undefined)}>
        <FontSelect
          role={role}
          value={value?.font}
          current={cur.fontFamily}
          onChange={(v) => set("font", v)}
        />
      </Row>

      <Row
        label={`폰트 크기 ${cur.fontSize}px`}
        modified={has("fontSize")}
        onReset={() => set("fontSize", undefined)}
      >
        <input
          type="range"
          min={FONT_SIZE.min}
          max={FONT_SIZE.max}
          step={1}
          value={value?.fontSize ?? base.fontSize}
          onChange={(e) => set("fontSize", Number(e.target.value))}
          className="w-full"
        />
      </Row>

      <Row
        label={`행간 ${cur.lineHeight.toFixed(2)}`}
        modified={has("lineHeight")}
        onReset={() => set("lineHeight", undefined)}
      >
        <input
          type="range"
          min={1}
          max={2.4}
          step={0.05}
          value={value?.lineHeight ?? base.lineHeight}
          onChange={(e) => set("lineHeight", Number(e.target.value))}
          className="w-full"
        />
      </Row>

      <Row
        label={`자간 ${value?.letterSpacing ?? base.letterSpacing}px`}
        modified={has("letterSpacing")}
        onReset={() => set("letterSpacing", undefined)}
      >
        <input
          type="range"
          min={-2}
          max={6}
          step={0.5}
          value={value?.letterSpacing ?? base.letterSpacing}
          onChange={(e) => set("letterSpacing", Number(e.target.value))}
          className="w-full"
        />
      </Row>

      <div className="grid grid-cols-2 gap-2">
        <Row
          label="위 여백"
          modified={has("marginTop")}
          onReset={() => set("marginTop", undefined)}
        >
          <input
            type="number"
            value={value?.marginTop ?? base.marginTop}
            onChange={(e) => set("marginTop", Number(e.target.value))}
          />
        </Row>
        <Row
          label="아래 여백"
          modified={has("marginBottom")}
          onReset={() => set("marginBottom", undefined)}
        >
          <input
            type="number"
            value={value?.marginBottom ?? base.marginBottom}
            onChange={(e) => set("marginBottom", Number(e.target.value))}
          />
        </Row>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Btn
          size="sm"
          variant={cur.fontWeight >= 700 ? "primary" : "default"}
          onClick={() => set("bold", !(value?.bold ?? base.bold))}
        >
          굵게
        </Btn>
        <Btn
          size="sm"
          variant={cur.highlight ? "primary" : "default"}
          onClick={() => set("highlight", !(value?.highlight ?? base.highlight))}
        >
          형광펜
        </Btn>
        <label className="flex items-center gap-1.5 text-[11px]">
          <input
            type="color"
            value={cur.color}
            onChange={(e) => set("color", e.target.value)}
            style={{ width: 28, height: 24, padding: 0, border: "none", background: "none" }}
          />
          색상
          {has("color") && (
            <button
              onClick={() => set("color", undefined)}
              title="기본 색상으로"
              style={{ color: "var(--ui-muted)" }}
            >
              ↺
            </button>
          )}
        </label>
      </div>
    </div>
  );
}

/**
 * 글꼴 고르기. 고르지 않으면 그 자리의 기본 글꼴을 쓴다.
 * 인스펙터와 블록 줄의 빠른 조절이 함께 쓰므로 목록과 '기본' 표기가 한곳에서만 정해진다.
 */
export function FontSelect({
  role,
  value,
  current,
  onChange,
  style,
}: {
  role: Role;
  value: string | undefined;
  /** 지금 적용된 글꼴 CSS — 고른 모양을 상자에서 바로 보여주려고 받는다 */
  current: string;
  onChange: (v: string | undefined) => void;
  style?: CSSProperties;
}) {
  const fallback = FONTS.find((f) => f.key === roleFontKey(role))?.label;

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      style={{ fontFamily: current, ...style }}
    >
      <option value="" style={{ fontFamily: "var(--font-ui)" }}>
        기본 — {fallback}
      </option>
      {FONTS.map((f) => (
        <option key={f.key} value={f.key} style={{ fontFamily: f.css }}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

function Row({
  label,
  modified,
  onReset,
  children,
}: {
  label: string;
  modified: boolean;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-semibold" style={{ color: "var(--ui-muted)" }}>
          {label}
        </span>
        {modified && (
          <>
            <span
              title="기본값과 다름"
              style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: "var(--ui-accent)",
                display: "inline-block",
              }}
            />
            <button
              onClick={onReset}
              title="기본값으로"
              className="text-[11px]"
              style={{ color: "var(--ui-muted)" }}
            >
              ↺
            </button>
          </>
        )}
      </div>
      {children}
    </div>
  );
}
