import { DEFAULT_THEME } from "./layout";
import type { BulletinDoc, ChurchInfo, CoverText, FixedPages, Theme } from "./types";

/** 다음 주보에 상속되는 기본값. 고정 페이지·교회 정보·테마. */
export interface Settings {
  church: ChurchInfo;
  fixed: FixedPages;
  theme: Theme;
}

export function newId(prefix = "b"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 주보 id는 서버(Postgres uuid)와 맞춰야 하므로 uuid로 만든다 */
export function newDocId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return newId("doc");
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 다가오는(또는 오늘) 주일 */
export function upcomingSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return toISO(d);
}

export function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 표지 서식이 바뀌면 올린다. 예전 저장본을 새 기본 서식으로 갱신하는 기준이 된다. */
export const COVER_TEMPLATE_VERSION = 7;

/** 표지 기본 로고 위치 — 아치형 교회명 아래 가운데 */
const DEFAULT_LOGO_BOX = { x: 296, y: 325, width: 300 };

/**
 * 표지 기본 문구.
 * 실제 주보 표지의 배치를 그대로 옮겨 위치·크기까지 잡아두었으므로 문구만 고쳐 쓰면 된다.
 */
export function makeDefaultCoverTexts(): CoverText[] {
  const cream = "#F7EBC4";
  const inkline = "#8C7A4A";
  return [
    {
      id: newId("ct"),
      text: "포도나무교회",
      kind: "arch",
      y: 84,
      size: 96,
      curve: 138,
      color: cream,
      outline: inkline,
      outlineWidth: 3,
      letterSpacing: 30,
      font: "ssurround",
    },
    {
      id: newId("ct"),
      text: "THE PIECE",
      kind: "arch",
      y: 880,
      size: 62,
      curve: -90,
      color: "#FFFFFF",
      outline: "#D8D2C0",
      outlineWidth: 3,
      letterSpacing: 6,
      font: "ssurround",
    },
    {
      id: newId("ct"),
      text: "청년교구",
      kind: "arch",
      y: 936,
      size: 88,
      curve: -105,
      color: cream,
      outline: inkline,
      outlineWidth: 3,
      letterSpacing: 34,
      font: "ssurround",
    },
    {
      id: newId("ct"),
      text: "VINE",
      kind: "line",
      y: 1176,
      size: 25,
      curve: 0,
      color: "#4A4A4A",
      letterSpacing: 5,
      font: "body",
    },
    {
      id: newId("ct"),
      text: "YOUNG ADULT & COLLEGE",
      kind: "line",
      y: 1208,
      size: 28,
      curve: 0,
      color: "#4A4A4A",
      letterSpacing: 3,
      font: "body",
    },
  ];
}

export function makeDefaultSettings(): Settings {
  return {
    church: {
      pastorLine: "담당 목사  |  ",
      accountLine: "청년교구 계좌  |  ",
    },
    fixed: {
      cover: {
        showDate: true,
        showLogo: true,
        logo: { ...DEFAULT_LOGO_BOX },
        texts: makeDefaultCoverTexts(),
        templateVersion: COVER_TEMPLATE_VERSION,
      },
      worship: {
        heading: "예배 안내",
        rows: [
          { id: newId("r"), label: "주일 1부 예배", value: "8:30" },
          { id: newId("r"), label: "주일 2부 예배", value: "11:00" },
          { id: newId("r"), label: "청년부 예배", value: "15:00" },
          { id: newId("r"), label: "오이코스", value: "주중, 오이코스별" },
          { id: newId("r"), label: "목요일 이사야62 기도회", value: "20:00 / 본당" },
          { id: newId("r"), label: "금요일 RGW", value: "20:00 / 본당" },
          { id: newId("r"), label: "새벽 예배", value: "매일 6:30 / ZOOM" },
        ],
        birthdayHeading: "{month}월 생일",
        birthdays: {},
      },
    },
    theme: { ...DEFAULT_THEME },
  };
}

export function makeDraft(settings: Settings, serviceDate = upcomingSunday()): BulletinDoc {
  return {
    id: newDocId(),
    serviceDate,
    theme: { ...settings.theme },
    church: { ...settings.church },
    fixed: deepCopy(settings.fixed),
    blocks: [
      { id: newId("sch"), kind: "schedule", heading: "주요일정", items: [] },
      { id: newId("ser"), kind: "sermon", heading: "본문 말씀", title: "", verse: "" },
    ],
    exportScale: 3,
    exportFormat: "jpg",
    distribution: { band: false, newFamily: false },
  };
}

/** 예전에 저장한 데이터에 새로 생긴 항목(표지 글자·로고)을 채워 넣는다 */
export function normalizeFixed(fixed: FixedPages): FixedPages {
  const base = makeDefaultSettings().fixed;
  // 표지 서식이 옛 버전이면 글자와 로고를 새 기본 배치로 갱신한다
  const outdated = (fixed?.cover?.templateVersion ?? 0) < COVER_TEMPLATE_VERSION;

  return {
    ...fixed,
    cover: {
      ...base.cover,
      ...fixed?.cover,
      texts: outdated
        ? makeDefaultCoverTexts()
        : fixed.cover.texts.map((t) => ({
            ...t,
            font: t.font ?? (t.titleFont ? "ssurround" : "body"),
          })),
      logo: outdated ? { ...DEFAULT_LOGO_BOX } : (fixed.cover.logo ?? base.cover.logo),
      showLogo: fixed?.cover?.showLogo ?? true,
      templateVersion: COVER_TEMPLATE_VERSION,
    },
    worship: { ...base.worship, ...fixed?.worship },
  };
}

export function normalizeSettings(s: Partial<Settings> | null | undefined): Settings {
  const base = makeDefaultSettings();
  if (!s) return base;
  return {
    church: { ...base.church, ...s.church },
    theme: { ...base.theme, ...s.theme },
    fixed: normalizeFixed({ ...base.fixed, ...s.fixed }),
  };
}
