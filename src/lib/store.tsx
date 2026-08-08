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
  closeToday as closeTodayRpc,
  loadPublished,
  openToday as openTodayRpc,
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
  /** 저장에 성공했으면 true. 실패는 화면에서 알려야 하므로 조용히 삼키지 않는다. */
  saveCurrent: () => Promise<boolean>;
  openSaved: (id: string) => void;
  duplicateSaved: (id: string) => void;
  /** 지웠으면 true. 실패는 화면에서 알려야 하므로 조용히 삼키지 않는다. */
  removeSaved: (id: string) => Promise<boolean>;
  /** 저장 뒤에 고친 것을 모두 버리고 마지막으로 저장한 상태로 되돌린다 */
  revertToSaved: () => void;
  /** 되돌릴 저장본이 있고, 되돌릴 변경도 있는지 */
  canRevert: boolean;
  startNew: () => void;
  attachImages: (docId: string, keys: string[]) => Promise<void>;
  /**
   * QR 주소에 지금 올라가 있는 주보. 서버 모드가 아니면 null.
   * 저장과 다르다 — 저장은 우리끼리 보관, 올리기는 남에게 공개다.
   */
  published: PublishState | null;
  /** 작성 중인 주보를 저장하고 QR 주소에 올린다. 페이지 이미지가 없으면 만들어 함께 올린다. */
  publishCurrent: (makeImages: () => Promise<Blob[]>) => Promise<boolean>;
  /** 보관함에 있는 주보로 갈아 끼운다 */
  publishSaved: (id: string) => Promise<boolean>;
  /** QR 주소를 다시 닫는다 */
  unpublish: () => Promise<boolean>;
  /**
   * 주일이 아닌 날, 오늘 하루만 연다. 관리자만 쓸 수 있다(잠금은 DB에 있다).
   * QR은 평소 주일에만 열리므로, 수요예배·성탄절처럼 따로 보여줄 날에 쓴다.
   */
  openToday: () => Promise<boolean>;
  /** 오늘 따로 열어둔 것을 거둔다. 주보는 그대로 올라가 있다. */
  closeToday: () => Promise<boolean>;
  urls: { background?: string; cover?: string; logo?: string };
  loaded: boolean;
  dirty: boolean;
  saving: boolean;
  error?: string;
}

const DocContext = createContext<DocContextValue | null>(null);

/**
 * 지금 어느 주보나 설정이라도 가리키고 있는 이미지 키 전부.
 * 여기 없는 이미지는 아무도 쓰지 않는다는 뜻이라 저장소에서 지워도 된다.
 *
 * 이미지 키를 담는 자리가 새로 생기면 반드시 여기에 더해야 한다.
 * 빠뜨리면 쓰고 있는 그림이 '아무도 안 쓴다'고 판단되어 지워진다.
 */
function referencedKeys(
  doc: BulletinDoc,
  library: BulletinDoc[],
  settings: Settings,
): Set<string> {
  const keep = new Set<string>();
  const add = (...keys: (string | undefined)[]) => {
    for (const k of keys) if (k) keep.add(k);
  };

  const addDoc = (d: BulletinDoc) => {
    add(d.theme.backgroundUrl, d.theme.coverUrl, d.theme.logoUrl);
    // 지금은 아무도 채우지 않지만, 채우는 순간 지워지는 일이 없도록 미리 센다
    add(d.fixed?.cover?.imageUrl);
    d.imageKeys?.forEach((k) => keep.add(k));
  };

  // 작성 중인 주보도 센다 — 아직 저장하지 않았다고 배경을 뺏으면 안 된다
  for (const b of [doc, ...library]) addDoc(b);

  add(settings.theme.backgroundUrl, settings.theme.coverUrl, settings.theme.logoUrl);
  add(settings.fixed?.cover?.imageUrl);

  return keep;
}

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

  /**
   * 보관함을 서버에서 실제로 받아왔는지.
   *
   * 못 받아온 채로 이미지를 정리하면 지난 주보를 하나도 모르는 상태에서 세게 되고,
   * 그러면 남들이 쓰는 배경까지 '아무도 안 쓴다'고 판단해 지운다.
   * 목록을 확실히 아는 동안에만 정리한다.
   */
  const librarySynced = useRef(false);
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
        librarySynced.current = true;
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
        // 배경 사진만은 이 주보의 것을 지킨다.
        // 배경은 주마다 다른 것이라 기본값에 담기지 않는데, 그대로 덮으면
        // 방금 올린 배경이 설정을 건드리는 순간(글자색 조절 같은 것) 사라진다.
        theme: { ...d.theme, ...next.theme, backgroundUrl: d.theme.backgroundUrl },
      }));
      setDirty(true);
      void backend.saveSettings(next).catch(() => setError("설정을 저장하지 못했습니다."));
    },
    [settings, backend],
  );

  /**
   * 저장소에는 지금 쓰는 이미지만 남긴다.
   * 배경을 바꾸거나 주보를 지우면 옛 이미지는 아무도 가리키지 않게 되는데,
   * 그대로 두면 쓰지도 않는 파일이 용량만 차지한다.
   * 화면을 막을 일은 아니라 저장·삭제가 끝난 뒤 뒤에서 돌린다.
   */
  const prune = useCallback(
    (nextDoc: BulletinDoc, nextLibrary: BulletinDoc[], nextSettings: Settings) => {
      if (!librarySynced.current) return;
      void backend.pruneImages(referencedKeys(nextDoc, nextLibrary, nextSettings)).catch(
        () => undefined,
      );
    },
    [backend],
  );

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await backend.saveBulletin(doc);
      const nextLibrary = [saved, ...library.filter((b) => b.id !== saved.id)].sort((a, b) =>
        b.serviceDate.localeCompare(a.serviceDate),
      );
      setDocState(saved);
      setLibrary(nextLibrary);
      setDirty(false);
      prune(saved, nextLibrary, settings);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [doc, library, settings, backend, prune]);

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
    async (id: string): Promise<boolean> => {
      try {
        await backend.deleteBulletin(id);
      } catch (e) {
        // 목록에서 지우지 않는다 — 서버에 남아 있는데 사라진 것처럼 보이면 안 된다
        setError(e instanceof Error ? e.message : "삭제하지 못했습니다.");
        return false;
      }
      const nextLibrary = library.filter((b) => b.id !== id);
      setError(undefined);
      setLibrary(nextLibrary);
      // 올라가 있던 주보를 지웠으면 QR도 함께 비워진다 (DB에서 연결이 끊긴다)
      setPublished((p) =>
        p?.bulletinId === id ? { ...p, bulletinId: null, publishedAt: null } : p,
      );
      prune(doc, nextLibrary, settings);
      return true;
    },
    [doc, library, settings, backend, prune],
  );

  /**
   * 마지막으로 저장한 상태로 되돌린다.
   *
   * 교회 정보·고정 페이지·테마는 저장을 누르지 않아도 바로 반영되는 '기본값'이라
   * 주보만 되돌리면 화면의 조절기와 미리보기가 서로 다른 값을 가리킨다.
   * 그래서 저장본에 함께 담겨 있던 그때의 기본값까지 같이 되돌린다.
   */
  const revertToSaved = useCallback(() => {
    const saved = library.find((b) => b.id === doc.id);
    if (!saved) return;

    const copy = deepCopy(saved);
    const next: Settings = {
      church: { ...copy.church },
      fixed: deepCopy(copy.fixed),
      theme: { ...copy.theme },
    };

    setDocState(copy);
    setSettingsState(next);
    setDirty(false);
    setError(undefined);
    void backend.saveSettings(next).catch(() => setError("설정을 되돌리지 못했습니다."));
  }, [library, doc.id, backend]);

  const canRevert = dirty && library.some((b) => b.id === doc.id);

  const startNew = useCallback(() => {
    setDocState(makeDraft(settings));
    setDirty(false);
  }, [settings]);

  /**
   * 내보낸 이미지를 주보에 붙여 과거 조회에서 그대로 다시 받을 수 있게 한다.
   *
   * 주보 한 부가 갖는 이미지는 마지막으로 내보낸 한 벌뿐이다.
   * 그래서 새 목록이 자리 잡은 것을 확인한 뒤, 이전에 내보냈던 이미지는 지운다.
   * (순서를 뒤집으면 목록 갱신에 실패했을 때 받을 이미지가 하나도 남지 않는다)
   */
  const attachImages = useCallback(
    async (docId: string, keys: string[]) => {
      const before =
        (docId === doc.id ? doc.imageKeys : library.find((b) => b.id === docId)?.imageKeys) ?? [];

      setDocState((d) => (d.id === docId ? { ...d, imageKeys: keys } : d));
      setLibrary((lib) => lib.map((b) => (b.id === docId ? { ...b, imageKeys: keys } : b)));

      // 이미 보관함에 들어간 주보면 서버의 이미지 목록도 지금 바꾼다.
      // 저장을 누를 때까지 미루면 그 사이 새로고침한 사람은 지워진 옛 이미지를 가리키게 된다.
      if (library.some((b) => b.id === docId)) {
        try {
          await backend.setBulletinImages(docId, keys);
        } catch {
          setError("내보낸 이미지를 보관함에 반영하지 못했습니다.");
          return;
        }
      }

      const stale = before.filter((k) => !keys.includes(k));
      if (stale.length) await backend.removeImages(stale).catch(() => undefined);
    },
    [doc, library, backend],
  );

  /**
   * 작성 중인 주보를 QR 주소에 올린다.
   *
   * 올리기 전에 저장부터 한다 — 올린 주보를 남이 여는 사이에 서버에 없는 상태가 되면 안 된다.
   * 폰에서 보여줄 페이지 이미지는 올릴 때마다 새로 만든다. 있던 것을 그대로 쓰면,
   * 오타를 고치고 다시 올렸는데 고치기 전 그림이 그대로 걸려 있는 일이 생긴다.
   * 갈아 끼운 뒤 옛 이미지는 지운다 — 남겨두면 매주 쌓여 저장 공간만 먹는다.
   */
  const publishCurrent = useCallback(
    async (makeImages: () => Promise<Blob[]>): Promise<boolean> => {
      if (backend.kind !== "supabase") {
        setError("서버에 연결해야 QR로 공유할 수 있습니다.");
        return false;
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

        const nextLibrary = [saved, ...library.filter((b) => b.id !== saved.id)].sort((a, b) =>
          b.serviceDate.localeCompare(a.serviceDate),
        );
        setDocState(saved);
        setLibrary(nextLibrary);
        setDirty(false);
        // 따로 열어둔 것은 올린다고 달라지지 않는다 — 그대로 둔다
        setPublished((p) => ({ bulletinId: saved.id, publishedAt: at, openUntil: p?.openUntil ?? null }));
        // 올리기도 저장이다 — 저장할 때와 똑같이 남는 이미지를 정리한다
        prune(saved, nextLibrary, settings);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "QR에 올리지 못했습니다.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [doc, library, settings, backend, prune],
  );

  /** 보관함에 있는 주보로 갈아 끼운다 */
  const publishSaved = useCallback(async (id: string): Promise<boolean> => {
    setError(undefined);
    try {
      const at = await publishBulletin(id);
      setPublished((p) => ({ bulletinId: id, publishedAt: at, openUntil: p?.openUntil ?? null }));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR에 올리지 못했습니다.");
      return false;
    }
  }, []);

  const unpublish = useCallback(async (): Promise<boolean> => {
    setError(undefined);
    try {
      await unpublishBulletin();
      // 내리기는 닫는 일이다 — 따로 열어둔 것도 DB에서 함께 거둬진다
      setPublished({ bulletinId: null, publishedAt: null, openUntil: null });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR에서 내리지 못했습니다.");
      return false;
    }
  }, []);

  const openToday = useCallback(async (): Promise<boolean> => {
    setError(undefined);
    try {
      const until = await openTodayRpc();
      setPublished((p) => (p ? { ...p, openUntil: until } : p));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR을 열지 못했습니다.");
      return false;
    }
  }, []);

  const closeToday = useCallback(async (): Promise<boolean> => {
    setError(undefined);
    try {
      await closeTodayRpc();
      setPublished((p) => (p ? { ...p, openUntil: null } : p));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR을 닫지 못했습니다.");
      return false;
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
      revertToSaved,
      canRevert,
      startNew,
      attachImages,
      published,
      publishCurrent,
      publishSaved,
      unpublish,
      openToday,
      closeToday,
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
      revertToSaved,
      canRevert,
      startNew,
      attachImages,
      published,
      publishCurrent,
      publishSaved,
      unpublish,
      openToday,
      closeToday,
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
