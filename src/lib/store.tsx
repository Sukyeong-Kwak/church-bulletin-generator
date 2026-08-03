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
import { getBackend } from "./backend";
import {
  loadPublished,
  publishBulletin,
  unpublishBulletin,
  type PublishState,
} from "./publish";
import {
  deepCopy,
  makeDefaultSettings,
  makeDraft,
  newDocId,
  normalizeFixed,
  normalizeTheme,
  toISO,
  type Settings,
} from "./settings";
import type { BulletinDoc, FlowBlock } from "./types";

export { newId, makeDefaultSettings, makeDraft } from "./settings";
export type { Settings } from "./settings";

/** 작성 중인 주보는 새로고침해도 남도록 이 브라우저에 따로 둔다 */
const DRAFT_KEY = "bulletin-draft-v1";

interface DocContextValue {
  /** 작성 중인 주보 */
  doc: BulletinDoc;
  setDoc: (updater: (prev: BulletinDoc) => BulletinDoc) => void;
  settings: Settings;
  setSettings: (updater: (prev: Settings) => Settings) => void;
  /** 저장된 주보 목록 (최신순) */
  library: BulletinDoc[];
  saveCurrent: () => Promise<void>;
  openSaved: (id: string) => void;
  duplicateSaved: (id: string) => void;
  removeSaved: (id: string) => Promise<void>;
  startNew: () => void;
  attachImages: (docId: string, keys: string[]) => void;
  /**
   * QR 주소에 지금 올라가 있는 주보. 서버 모드가 아니면 null.
   * 저장과 다르다 — 저장은 우리끼리 보관, 올리기는 남에게 공개다.
   */
  published: PublishState | null;
  /** 작성 중인 주보를 저장하고 QR 주소에 올린다. 페이지 이미지가 없으면 만들어 함께 올린다. */
  publishCurrent: (makeImages: () => Promise<Blob[]>) => Promise<void>;
  /** 보관함에 있는 주보로 갈아 끼운다 */
  publishSaved: (id: string) => Promise<void>;
  /** QR 주소를 다시 닫는다 */
  unpublish: () => Promise<void>;
  urls: { background?: string; cover?: string; logo?: string };
  loaded: boolean;
  dirty: boolean;
  saving: boolean;
  error?: string;
}

const DocContext = createContext<DocContextValue | null>(null);

export function DocProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);

  const [settings, setSettingsState] = useState<Settings>(makeDefaultSettings);
  const [doc, setDocState] = useState<BulletinDoc>(() => makeDraft(makeDefaultSettings()));
  const [library, setLibrary] = useState<BulletinDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [urls, setUrls] = useState<DocContextValue["urls"]>({});
  const [published, setPublished] = useState<PublishState | null>(null);

  // 저장소를 읽는 일은 첫 렌더 뒤에만 가능하다.
  // 초기값에서 바로 읽으면 서버 렌더 결과와 달라져 하이드레이션이 깨진다.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [s, list, pub] = await Promise.all([
          backend.loadSettings(),
          backend.listBulletins(),
          backend.kind === "supabase" ? loadPublished() : Promise.resolve(null),
        ]);
        if (!alive) return;

        const next = s ?? makeDefaultSettings();
        setSettingsState(next);
        setLibrary(list);
        setPublished(pub);

        const raw = localStorage.getItem(DRAFT_KEY);
        const draft = raw ? (JSON.parse(raw) as BulletinDoc) : null;
        setDocState(
          draft
            ? {
                ...makeDraft(next),
                ...draft,
                fixed: normalizeFixed(draft.fixed ?? next.fixed),
                theme: normalizeTheme(draft.theme ?? next.theme),
              }
            : makeDraft(next),
        );
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
      } finally {
        if (alive) setLoaded(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [backend]);

  // 작성 중인 내용은 브라우저에 임시 보관한다 (저장을 누르면 보관함으로 들어간다)
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(doc));
      } catch {
        // 임시 보관 실패는 편집을 막지 않는다
      }
    }, 300);
    return () => clearTimeout(t);
  }, [doc, loaded]);

  // 배경·표지·로고 이미지를 받아 화면에 쓸 주소를 만든다
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
        const blob = await backend.getImage(key).catch(() => undefined);
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
  }, [imgKeys, loaded, backend]);

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
      void backend.saveSettings(next).catch(() => setError("설정을 저장하지 못했습니다."));
    },
    [settings, backend],
  );

  const saveCurrent = useCallback(async () => {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await backend.saveBulletin(doc);
      setDocState(saved);
      setLibrary((lib) =>
        [saved, ...lib.filter((b) => b.id !== saved.id)].sort((a, b) =>
          b.serviceDate.localeCompare(a.serviceDate),
        ),
      );
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }, [doc, backend]);

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
      copy.id = newDocId();
      copy.updatedAt = undefined;
      copy.imageKeys = undefined;
      const d = new Date(found.serviceDate);
      d.setDate(d.getDate() + 7);
      copy.serviceDate = toISO(d);

      setDocState(copy);
      setDirty(true);
    },
    [library],
  );

  const removeSaved = useCallback(
    async (id: string) => {
      await backend.deleteBulletin(id).catch(() => setError("삭제하지 못했습니다."));
      setLibrary((lib) => lib.filter((b) => b.id !== id));
      // 올라가 있던 주보를 지웠으면 QR도 함께 비워진다 (DB에서 연결이 끊긴다)
      setPublished((p) => (p?.bulletinId === id ? { bulletinId: null, publishedAt: null } : p));
    },
    [backend],
  );

  const startNew = useCallback(() => {
    setDocState(makeDraft(settings));
    setDirty(false);
  }, [settings]);

  /** 내보낸 이미지를 주보에 붙여 과거 조회에서 그대로 다시 받을 수 있게 한다 */
  const attachImages = useCallback((docId: string, keys: string[]) => {
    setDocState((d) => (d.id === docId ? { ...d, imageKeys: keys } : d));
    setLibrary((lib) => lib.map((b) => (b.id === docId ? { ...b, imageKeys: keys } : b)));
  }, []);

  /**
   * 작성 중인 주보를 QR 주소에 올린다.
   *
   * 올리기 전에 저장부터 한다 — 올린 주보를 남이 여는 사이에 서버에 없는 상태가 되면 안 된다.
   * 폰에서 보여줄 페이지 이미지는 올릴 때마다 새로 만든다. 있던 것을 그대로 쓰면,
   * 오타를 고치고 다시 올렸는데 고치기 전 그림이 그대로 걸려 있는 일이 생긴다.
   * 갈아 끼운 뒤 옛 이미지는 지운다 — 남겨두면 매주 쌓여 저장 공간만 먹는다.
   */
  const publishCurrent = useCallback(
    async (makeImages: () => Promise<Blob[]>) => {
      if (backend.kind !== "supabase") {
        setError("서버에 연결해야 QR로 공유할 수 있습니다.");
        return;
      }

      setSaving(true);
      setError(undefined);
      try {
        const old = doc.imageKeys ?? [];

        const blobs = await makeImages();
        const keys: string[] = [];
        for (const b of blobs) keys.push(await backend.putImage(b, "export"));

        const saved = await backend.saveBulletin({ ...doc, imageKeys: keys });
        const at = await publishBulletin(saved.id);

        // 새 이미지가 무사히 자리 잡은 뒤에 옛 것을 지운다
        void backend.removeImages(old.filter((k) => !keys.includes(k))).catch(() => {});

        setDocState(saved);
        setLibrary((lib) =>
          [saved, ...lib.filter((b) => b.id !== saved.id)].sort((a, b) =>
            b.serviceDate.localeCompare(a.serviceDate),
          ),
        );
        setDirty(false);
        setPublished({ bulletinId: saved.id, publishedAt: at });
      } catch (e) {
        setError(e instanceof Error ? e.message : "QR에 올리지 못했습니다.");
      } finally {
        setSaving(false);
      }
    },
    [doc, backend],
  );

  /** 보관함에 있는 주보로 갈아 끼운다 */
  const publishSaved = useCallback(async (id: string) => {
    setError(undefined);
    try {
      const at = await publishBulletin(id);
      setPublished({ bulletinId: id, publishedAt: at });
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR에 올리지 못했습니다.");
    }
  }, []);

  const unpublish = useCallback(async () => {
    setError(undefined);
    try {
      await unpublishBulletin();
      setPublished({ bulletinId: null, publishedAt: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR에서 내리지 못했습니다.");
    }
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
      published,
      publishCurrent,
      publishSaved,
      unpublish,
      urls,
      loaded,
      dirty,
      saving,
      error,
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
      published,
      publishCurrent,
      publishSaved,
      unpublish,
      urls,
      loaded,
      dirty,
      saving,
      error,
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
