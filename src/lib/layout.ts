import type { Align, TextStyle, Theme } from "./types";

/** 캔버스 규격 — A4 세로 비율(1:1.414). 미리캔버스 원본과 동일. */
export const CANVAS = { w: 891, h: 1260 } as const;

/** 본문 반투명 카드 */
export const CARD = {
  x: 88,
  y: 105,
  w: 715,
  h: 1025,
  radius: 24,
  padX: 40,
  padY: 40,
} as const;

/** 카드 안쪽 가용 영역 */
export const CONTENT = {
  w: CARD.w - CARD.padX * 2,
  h: CARD.h - CARD.padY * 2,
} as const;

/** 상단 날짜 / 하단 푸터 */
export const DATE_TOP = 28;
export const FOOTER = { left: 30, bottom: 22, gap: 6 } as const;

/** 블록 사이 기본 간격, 헤더 아래 간격 */
export const BLOCK_GAP = 44;
export const HEADER_GAP = 36;

export type Role =
  | "date"
  | "adsHeader"
  | "blockTitle"
  | "blockBody"
  | "worshipHeading"
  | "worshipLabel"
  | "worshipValue"
  | "birthdayHeading"
  | "birthdayName"
  | "scheduleHeading"
  | "scheduleItem"
  | "sermonHeading"
  | "sermonLine"
  | "footer";

type FullStyle = Required<Omit<TextStyle, "highlight">> & { highlight: boolean };

/**
 * 페이지 타입별 기본 타이포 스케일.
 * 사용자가 아무것도 수정하지 않아도 이 값으로 완성된 결과가 나온다.
 */
export const DEFAULT_STYLES: Record<Role, FullStyle> = {
  date: f({ fontSize: 26, lineHeight: 1.4, align: "center" }),
  adsHeader: f({ fontSize: 52, lineHeight: 1.3, align: "center", bold: true, title: true, marginBottom: 0 }),
  blockTitle: f({ fontSize: 28, lineHeight: 1.4, align: "center", highlight: true, marginBottom: 10 }),
  blockBody: f({ fontSize: 27, lineHeight: 1.6, align: "center" }),
  worshipHeading: f({ fontSize: 52, lineHeight: 1.3, align: "center", bold: true, title: true, marginBottom: 24 }),
  worshipLabel: f({ fontSize: 27, lineHeight: 1.5, align: "right" }),
  worshipValue: f({ fontSize: 27, lineHeight: 1.5, align: "left" }),
  birthdayHeading: f({ fontSize: 46, lineHeight: 1.3, align: "center", bold: true, title: true, marginTop: 40, marginBottom: 20 }),
  birthdayName: f({ fontSize: 27, lineHeight: 1.6, align: "center" }),
  scheduleHeading: f({ fontSize: 30, lineHeight: 1.4, align: "center", highlight: true, marginBottom: 12 }),
  scheduleItem: f({ fontSize: 27, lineHeight: 1.6, align: "center" }),
  sermonHeading: f({ fontSize: 46, lineHeight: 1.3, align: "center", bold: true, title: true, marginTop: 24, marginBottom: 14 }),
  sermonLine: f({ fontSize: 27, lineHeight: 1.6, align: "center" }),
  footer: f({ fontSize: 24, lineHeight: 1.4, align: "left" }),
};

/** 제목용 폰트를 쓰는 역할 */
const TITLE_ROLES = new Set<Role>([
  "adsHeader",
  "worshipHeading",
  "birthdayHeading",
  "sermonHeading",
]);

function f(p: {
  fontSize: number;
  lineHeight: number;
  align: Align;
  bold?: boolean;
  marginTop?: number;
  marginBottom?: number;
  highlight?: boolean;
  title?: boolean;
}): FullStyle {
  return {
    fontSize: p.fontSize,
    lineHeight: p.lineHeight,
    align: p.align,
    bold: p.bold ?? false,
    color: "",
    letterSpacing: 0,
    marginTop: p.marginTop ?? 0,
    marginBottom: p.marginBottom ?? 0,
    highlight: p.highlight ?? false,
  };
}

export interface ResolvedStyle {
  fontSize: number;
  lineHeight: number;
  textAlign: Align;
  fontWeight: number;
  color: string;
  letterSpacing: string;
  marginTop: number;
  marginBottom: number;
  fontFamily: string;
  highlight: boolean;
}

/**
 * 테마 → 역할 기본값 → 사용자 오버라이드 순으로 병합.
 * override에 없는 키는 기본값을 따르므로 "기본값으로 되돌리기"는 키를 지우기만 하면 된다.
 */
export function resolveStyle(
  role: Role,
  theme: Theme,
  override?: TextStyle,
): ResolvedStyle {
  const base = DEFAULT_STYLES[role];
  const o = override ?? {};
  const isTitle = TITLE_ROLES.has(role);
  const defaultColor = isTitle ? theme.titleColor : theme.bodyColor;

  return {
    fontSize: Math.round((o.fontSize ?? base.fontSize) * theme.fontScale),
    lineHeight: o.lineHeight ?? base.lineHeight,
    textAlign: o.align ?? base.align,
    fontWeight: (o.bold ?? base.bold) ? 700 : 400,
    color: o.color || base.color || defaultColor,
    letterSpacing: `${o.letterSpacing ?? base.letterSpacing}px`,
    marginTop: o.marginTop ?? base.marginTop,
    marginBottom: o.marginBottom ?? base.marginBottom,
    fontFamily: isTitle ? "var(--font-title)" : "var(--font-body)",
    highlight: o.highlight ?? base.highlight,
  };
}

/** 표지 글자에 쓸 수 있는 글꼴 */
export const COVER_FONTS = [
  { key: "ssurround", label: "써라운드 (두툼·둥근)", css: "var(--font-ssurround)" },
  { key: "jua", label: "주아 (손글씨풍)", css: "var(--font-jua)" },
  { key: "jalnan", label: "잘난 (굵고 단단)", css: "var(--font-jalnan)" },
  { key: "title", label: "새마을 (주보 제목체)", css: "var(--font-title)" },
  { key: "body", label: "어린이마음 (본문체)", css: "var(--font-body)" },
] as const;

export type CoverFontKey = (typeof COVER_FONTS)[number]["key"];

export function coverFontCss(key: CoverFontKey | undefined, legacyTitleFont?: boolean): string {
  const found = COVER_FONTS.find((f) => f.key === key);
  if (found) return found.css;
  // 글꼴 선택이 생기기 전 저장본 호환
  return legacyTitleFont ? "var(--font-title)" : "var(--font-body)";
}

/** 인스펙터에서 "수정됨" 표시에 사용 */
export function isOverridden(override: TextStyle | undefined, key: keyof TextStyle): boolean {
  return override != null && override[key] !== undefined;
}

export const DEFAULT_THEME: Theme = {
  name: "기본",
  cardOpacity: 0.72,
  cardEnabled: true,
  titleColor: "#3B3B98",
  bodyColor: "#3D3D5C",
  highlightColor: "#FFF3B0",
  fontScale: 1,
};

/** '2026-07-19' → '2026.07.19.주일' */
export function formatServiceDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}.주일`;
}

/** '2026-07-19' → '2026-07' */
export function yearMonth(iso: string): string {
  return iso.slice(0, 7);
}

/** '2026-07-19' → 7 */
export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}
