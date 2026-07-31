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
import { DEFAULT_THEME } from "./layout";
import { deleteImage, getImage } from "./imageStore";
import type {
  BulletinDoc,
  ChurchInfo,
  CoverText,
  FixedPages,
  FlowBlock,
  Theme,
} from "./types";

const STORAGE_KEY = "bulletin-app-v1";

export function newId(prefix = "b"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 다가오는(또는 오늘) 주일 */
function upcomingSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return toISO(d);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 다음 주보에 상속되는 기본값. 고정 페이지 관리에서 편집한다. */
export interface Settings {
  church: ChurchInfo;
  fixed: FixedPages;
  theme: Theme;
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
    id: newId("doc"),
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

function deepCopy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 예전에 저장한 데이터에 새로 생긴 항목(표지 글자·로고)을 채워 넣는다 */
function normalizeFixed(fixed: FixedPages): FixedPages {
  const base = makeDefaultSettings().fixed;
  // 표지 서식이 옛 버전이면 글자와 로고를 새 기본 배치로 갱신한다
  const outdated = (fixed.cover?.templateVersion ?? 0) < COVER_TEMPLATE_VERSION;

  return {
    ...fixed,
    cover: {
      ...base.cover,
      ...fixed.cover,
      // 버전 판정을 먼저 끝냈으므로 아래에서 새 서식으로 덮어써도 안전하다
      texts: outdated
        ? makeDefaultCoverTexts()
        : fixed.cover.texts.map((t) => ({
            ...t,
            font: t.font ?? (t.titleFont ? "ssurround" : "body"),
          })),
      logo: outdated ? { ...DEFAULT_LOGO_BOX } : (fixed.cover.logo ?? base.cover.logo),
      showLogo: fixed.cover?.showLogo ?? true,
      templateVersion: COVER_TEMPLATE_VERSION,
    },
    worship: { ...base.worship, ...fixed.worship },
  };
}

interface PersistedState {
  settings: Settings;
  draft: BulletinDoc;
  library: BulletinDoc[];
}

interface DocContextValue {
  /** 작성 중인 주보 */
  doc: BulletinDoc;
  setDoc: (updater: (prev: BulletinDoc) => BulletinDoc) => void;
  settings: Settings;
  setSettings: (updater: (prev: Settings) => Settings) => void;
  /** 저장된 주보 목록 (최신순) */
  library: BulletinDoc[];
  saveCurrent: () => void;
  openSaved: (id: string) => void;
  duplicateSaved: (id: string) => void;
  removeSaved: (id: string) => void;
  startNew: () => void;
  attachImages: (docId: string, keys: string[]) => void;
  urls: { background?: string; cover?: string; logo?: string };
  loaded: boolean;
  dirty: boolean;
}

const DocContext = createContext<DocContextValue | null>(null);

export function DocProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<Settings>(makeDefaultSettings);
  const [doc, setDocState] = useState<BulletinDoc>(() => makeDraft(makeDefaultSettings()));
  const [library, setLibrary] = useState<BulletinDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [urls, setUrls] = useState<DocContextValue["urls"]>({});

  // 저장본 복원은 첫 렌더 이후에만 가능하다.
  // 초기값에서 바로 읽으면 서버 렌더 결과와 달라져 하이드레이션이 깨진다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<PersistedState>;
        const merged = { ...makeDefaultSettings(), ...(p.settings ?? {}) };
        const s: Settings = { ...merged, fixed: normalizeFixed(merged.fixed) };
        setSettingsState(s);
        setDocState(
          p.draft
            ? { ...makeDraft(s), ...p.draft, fixed: normalizeFixed(p.draft.fixed ?? s.fixed) }
            : makeDraft(s),
        );
        setLibrary(p.library ?? []);
      }
    } catch {
      // 저장본이 깨졌으면 기본값으로 시작
    }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 문서는 가볍다 — 이미지 원본은 IndexedDB에 따로 보관한다
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        const state: PersistedState = { settings, draft: doc, library };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // 저장 실패가 편집을 막지 않도록 무시
      }
    }, 300);
    return () => clearTimeout(t);
  }, [settings, doc, library, loaded]);

  // 배경·표지·로고 blob URL 준비
  const imgKeys = `${doc.theme.backgroundUrl ?? ""}|${doc.theme.coverUrl ?? ""}|${doc.theme.logoUrl ?? ""}`;
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const created: string[] = [];

    (async () => {
      const next: DocContextValue["urls"] = {};
      const pairs: [keyof DocContextValue["urls"], string | undefined][] = [
        ["background", doc.theme.backgroundUrl],
        ["cover", doc.theme.coverUrl],
        ["logo", doc.theme.logoUrl],
      ];
      for (const [name, key] of pairs) {
        if (!key) continue;
        const blob = await getImage(key);
        if (blob) {
          const url = URL.createObjectURL(blob);
          next[name] = url;
          created.push(url);
        }
      }
      if (!alive) {
        created.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      urlsRef.current = created;
      setUrls(next);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgKeys, loaded]);

  const setDoc = useCallback((updater: (prev: BulletinDoc) => BulletinDoc) => {
    setDocState((prev) => updater(prev));
    setDirty(true);
  }, []);

  /** 고정 페이지·교회정보·테마 수정은 기본값과 현재 작성본에 동시에 반영된다 */
  const setSettings = useCallback(
    (updater: (prev: Settings) => Settings) => {
      const next = updater(settings);
      setSettingsState(next);
      setDocState((d) => ({
        ...d,
        church: { ...next.church },
        fixed: deepCopy(next.fixed),
        theme: { ...d.theme, ...next.theme },
      }));
      setDirty(true);
    },
    [settings],
  );

  const saveCurrent = useCallback(() => {
    const saved: BulletinDoc = { ...deepCopy(doc), updatedAt: new Date().toISOString() };
    setDocState(saved);
    setLibrary((lib) =>
      [saved, ...lib.filter((b) => b.id !== saved.id)].sort((a, b) =>
        b.serviceDate.localeCompare(a.serviceDate),
      ),
    );
    setDirty(false);
  }, [doc]);

  const openSaved = useCallback(
    (id: string) => {
      const found = library.find((b) => b.id === id);
      if (!found) return;
      setDocState(deepCopy(found));
      setDirty(false);
    },
    [library],
  );

  /** 지난주 주보 복사 — 날짜만 바꾸고 달라진 광고만 수정하면 된다 */
  const duplicateSaved = useCallback(
    (id: string) => {
      const found = library.find((b) => b.id === id);
      if (!found) return;
      const copy = deepCopy(found);
      copy.id = newId("doc");
      copy.updatedAt = undefined;
      copy.imageKeys = undefined;
      copy.distribution = { band: false, newFamily: false };
      const d = new Date(found.serviceDate);
      d.setDate(d.getDate() + 7);
      copy.serviceDate = toISO(d);
      setDocState(copy);
      setDirty(true);
    },
    [library],
  );

  const removeSaved = useCallback(
    (id: string) => {
      const found = library.find((b) => b.id === id);
      // 보관 중이던 이미지도 함께 지운다
      found?.imageKeys?.forEach((k) => void deleteImage(k));
      setLibrary((lib) => lib.filter((b) => b.id !== id));
    },
    [library],
  );

  const startNew = useCallback(() => {
    setDocState(makeDraft(settings));
    setDirty(false);
  }, [settings]);

  /** 내보낸 PNG를 주보에 붙여 과거 조회에서 그대로 다시 받을 수 있게 한다 */
  const attachImages = useCallback((docId: string, keys: string[]) => {
    setDocState((d) => (d.id === docId ? { ...d, imageKeys: keys } : d));
    setLibrary((lib) => lib.map((b) => (b.id === docId ? { ...b, imageKeys: keys } : b)));
  }, []);

  const value = useMemo(
    () => ({
      doc,
      setDoc,
      settings,
      setSettings,
      library,
      saveCurrent,
      openSaved,
      duplicateSaved,
      removeSaved,
      startNew,
      attachImages,
      urls,
      loaded,
      dirty,
    }),
    [
      doc,
      setDoc,
      settings,
      setSettings,
      library,
      saveCurrent,
      openSaved,
      duplicateSaved,
      removeSaved,
      startNew,
      attachImages,
      urls,
      loaded,
      dirty,
    ],
  );

  return <DocContext.Provider value={value}>{children}</DocContext.Provider>;
}

export function useDoc(): DocContextValue {
  const ctx = useContext(DocContext);
  if (!ctx) throw new Error("DocProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}

/** 블록 배열 조작 헬퍼 */
export function updateBlock(
  blocks: FlowBlock[],
  id: string,
  patch: (b: FlowBlock) => FlowBlock,
): FlowBlock[] {
  return blocks.map((b) => (b.id === id ? patch(b) : b));
}

export function moveBlock(blocks: FlowBlock[], id: string, dir: -1 | 1): FlowBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const next = [...blocks];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
