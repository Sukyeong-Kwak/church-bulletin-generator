"use client";

import type { CSSProperties, ReactNode } from "react";
import { resolveStyle, type Role } from "@/lib/layout";
import type { TextStyle, Theme } from "@/lib/types";

interface TxtProps {
  role: Role;
  theme: Theme;
  override?: TextStyle;
  children: ReactNode;
  style?: CSSProperties;
  /** 줄바꿈(\n)을 그대로 살릴지 */
  preserveLines?: boolean;
}

/**
 * 역할 기반 텍스트 렌더러.
 * 스타일은 테마 → 역할 기본값 → 오버라이드 순으로 병합된다(§4-6).
 */
export function Txt({ role, theme, override, children, style, preserveLines }: TxtProps) {
  const s = resolveStyle(role, theme, override);

  const base: CSSProperties = {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    textAlign: s.textAlign,
    fontWeight: s.fontWeight,
    color: s.color,
    letterSpacing: s.letterSpacing,
    marginTop: s.marginTop,
    marginBottom: s.marginBottom,
    whiteSpace: preserveLines ? "pre-wrap" : undefined,
    wordBreak: "keep-all",
    ...style,
  };

  if (s.highlight) {
    // 형광펜은 글자 폭만큼만 칠한다
    return (
      <div style={base}>
        <span
          style={{
            backgroundColor: theme.highlightColor,
            padding: "0 8px",
            borderRadius: 3,
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          {children}
        </span>
      </div>
    );
  }

  return <div style={base}>{children}</div>;
}
