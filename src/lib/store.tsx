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
import { putAllWithWebCopy, URL_TTL } from "./backend/images";
import { useThemeImages, type ThemeUrls } from "./useThemeImages";
import { pastKeepWindow } from "./retention";
import { webKeyFor } from "./webImage";
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
  /**
   * 고른 주보를 한꺼번에 지운다. 지운 수와 못 지운 수를 돌려준다.
   * 하나가 막혀도 나머지는 지운다 — 열 부를 고르고 눌렀는데 첫 부에서 멈추면 다시 아홉 번을 해야 한다.
   */
  removeMany: (ids: string[]) => Promise<{ removed: number; failed: number }>;
  /** 바로 앞 상태로 한 걸음 되돌린다 */
  undo: () => void;
  /** 되돌린 것을 다시 앞으로 */
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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
  /**
   * 배경·표지·로고를 화면에 걸 주소. 화면용 축소본이다.
   * 내보내기는 원본이 필요하므로 그때만 loadFullThemeImages로 따로 받는다.
   */
  urls: ThemeUrls;
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
  // 원본을 지키면 그 화면용 축소본도 함께 지킨다. 짝이 끊기면 보는 쪽이 매번 원본을 받는다.
  const add = (...keys: (string | undefined)[]) => {
    for (const k of keys) {
      if (!k) continue;
      keep.add(k);
      keep.add(webKeyFor(k));
    }
  };

  const addDoc = (d: BulletinDoc) => {
    add(d.theme.backgroundUrl, d.theme.coverUrl, d.theme.logoUrl);
    // 지금은 아무도 채우지 않지만, 채우는 순간 지워지는 일이 없도록 미리 센다
    add(d.fixed?.cover?.imageUrl);
    add(...(d.imageKeys ?? []));
  };

  // 작성 중인 주보도 센다 — 아직 저장하지 않았다고 배경을 뺏으면 안 된다
  for (const b of [doc, ...library]) addDoc(b);

  add(settings.theme.backgroundUrl, settings.theme.coverUrl, settings.theme.logoUrl);
  add(settings.fixed?.cover?.imageUrl);

  return keep;
}

/**
 * 되돌리기 한 걸음의 크기.
 *
 * 글자 한 자마다 한 걸음이면 Cmd+Z 를 스무 번 눌러야 한 낱말이 지워진다. 그래서 손이 멈출
 * 때까지를 한 걸음으로 묶는다. 다만 계속 치는 사람에게는 그 묶음이 끝없이 자라므로,
 * 아무리 이어 쳐도 이만큼이 지나면 거기서 한 번 끊는다.
 */
const UNDO_IDLE_MS = 700;
const UNDO_BURST_MS = 4000;

/**
 * 몇 걸음까지 들고 있을지.
 *
 * 한 걸음은 그때의 주보와 기본값 한 벌인데, 고친 자리만 새 객체이고 나머지는 이전 것을
 * 그대로 가리킨다(퍼뜨리기로 고치기 때문이다). 그래서 예순 걸음이라도 주보 예순 부가 아니라
 * 고친 자리 예순 개 만큼만 든다.
 */
const UNDO_MAX = 60;

/** 되돌리기 한 걸음에 담기는 것 — 주보와 기본값은 함께 움직인다 */
interface Step {
  doc: BulletinDoc;
  settings: Settings;
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

  /**
   * 보관함을 서버에서 실제로 받아왔는지.
   *
   * 못 받아온 채로 이미지를 정리하면 지난 주보를 하나도 모르는 상태에서 세게 되고,
   * 그러면 남들이 쓰는 배경까지 '아무도 안 쓴다'고 판단해 지운다.
   * 목록을 확실히 아는 동안에만 정리한다.
   */
  const librarySynced = useRef(false);
  const [published, setPublished] = useState<PublishState | null>(null);

  /*
   * 되돌리기 이력.
   *
   * 걸음을 쌓는 자리를 setDoc 안에 두지 않는다. 그쪽은 React 가 같은 갱신 함수를 두 번 부를 수
   * 있는 자리라(개발 모드의 이중 호출) 걸음이 두 벌씩 쌓인다. 대신 '주보가 실제로 달라졌다'는
   * 사실을 아래 효과에서 보고 그때 한 걸음 적는다 — 어느 길로 고쳤든 한 곳에서 걸린다.
   *
   * seen 은 이력에 이미 반영한 마지막 한 벌이다. 되돌리기·보관함 열기처럼 이력을 직접
   * 손보는 길은 여기를 먼저 맞춰두어, 그 효과가 자기 발자국을 다시 밟지 않게 한다.
   */
  const past = useRef<Step[]>([]);
  const future = useRef<Step[]>([]);
  const seen = useRef<Step | null>(null);
  const stepAt = useRef({ last: 0, start: 0 });
  const [depth, setDepth] = useState({ past: 0, future: 0 });

  /**
   * 다음 한 번의 바뀜은 걸음으로 세지 않는다는 표시.
   *
   * 내보낸 이미지 목록을 주보에 붙이는 일(attachImages)이 그렇다. 사람이 고친 것이 아니라
   * 방금 만든 파일의 이름을 적어두는 살림이고, 옛 이름이 가리키던 파일은 그때 이미 지워졌다.
   * 그것까지 걸음으로 세면 되돌리기 한 번에 없는 파일을 가리키는 주보가 되고,
   * 그대로 저장하면 서버에도 그 이름이 적힌다.
   */
  const bookkeeping = useRef(false);

  /**
   * 마지막으로 저장한 그 주보.
   *
   * 되돌리기로 여기까지 물러났으면 저장할 것이 없다. 그때도 '저장'이라고 적혀 있으면
   * 눌러야 할 것 같은데 눌러도 달라지는 것이 없고, '초기화' 버튼까지 함께 서 있게 된다.
   * 걸음에 담기는 것은 저장 그 순간의 주보 객체 그대로라, 같은 것인지는 견주면 바로 안다.
   */
  const clean = useRef<BulletinDoc | null>(null);

  /**
   * 이력을 통째로 비우고 이 한 벌에서 다시 시작한다 — 다른 주보를 펼쳤을 때.
   * saved 는 '여기가 고칠 것 없는 자리인가'다 — 되돌아왔을 때 '저장됨'으로 돌아갈 자리.
   */
  const resetHistory = useCallback((step: Step, saved = true) => {
    past.current = [];
    future.current = [];
    seen.current = step;
    clean.current = saved ? step.doc : null;
    setDepth({ past: 0, future: 0 });
  }, []);

  /**
   * 걸음으로는 세지 않고 지금 자리만 새 값에 맞춘다.
   * 저장하면 서버가 다듬은 주보가 돌아오는데, 그것은 사람이 고친 것이 아니라
   * 방금 것의 다른 이름이라 되돌릴 자리가 아니다.
   */
  const settle = useCallback((step: Step) => {
    seen.current = step;
    clean.current = step.doc;
  }, []);

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
        const opened: BulletinDoc = draft
          ? {
              ...makeDraft(next),
              ...draft,
              fixed: normalizeFixed(draft.fixed ?? next.fixed),
              theme: normalizeTheme(draft.theme ?? next.theme),
            }
          : makeDraft(next);
        setDocState(opened);
        // 여기가 이력의 출발점이다 — 불러오기 자체를 되돌릴 걸음으로 세면
        // Cmd+Z 한 번에 빈 주보로 떨어진다
        resetHistory({ doc: opened, settings: next });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
      } finally {
        if (alive) setLoaded(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [backend, resetHistory]);

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

  // 배경·표지·로고를 화면에 걸 주소. 축소본을 한 번에 받아오고, 내려받기는 브라우저가 맡는다.
  const urls = useThemeImages(doc.theme, loaded, URL_TTL.edit);

  /*
   * 주보나 기본값이 달라졌으면 그 직전 한 벌을 걸음으로 적는다.
   *
   * 주보만 적지 않고 기본값까지 함께 적는다. 고정 페이지·교회 정보·테마는 저장을 누르지 않아도
   * 곧바로 반영되는 '기본값'이라, 주보만 되돌리면 왼쪽 조절기와 오른쪽 미리보기가 서로 다른
   * 값을 가리킨다 — revertToSaved 가 같은 까닭으로 둘을 함께 되돌린다.
   */
  useEffect(() => {
    const prev = seen.current;
    if (!prev) {
      seen.current = { doc, settings };
      return;
    }
    if (prev.doc === doc && prev.settings === settings) return;
    seen.current = { doc, settings };

    if (bookkeeping.current) {
      bookkeeping.current = false;
      return;
    }

    const now = Date.now();
    const t = stepAt.current;
    // 손이 멈췄거나, 이어 친 지 한참 되었으면 거기서 한 걸음을 끊는다
    const fresh = now - t.last > UNDO_IDLE_MS || now - t.start > UNDO_BURST_MS;
    if (fresh || past.current.length === 0) {
      past.current.push(prev);
      if (past.current.length > UNDO_MAX) past.current.shift();
      t.start = now;
    }
    t.last = now;
    // 되돌렸다가 다시 고치면 앞으로 갈 길은 사라진다 — 갈라진 가지를 들고 있지 않는다
    future.current = [];
    setDepth({ past: past.current.length, future: 0 });
  }, [doc, settings]);

  /** 걸음 하나를 그대로 펼친다. 기본값이 달라진 걸음일 때만 서버에도 알린다. */
  const applyStep = useCallback(
    (step: Step, from: Step | null) => {
      seen.current = step;
      // 다음에 고치는 것은 새 걸음으로 센다 — 되돌린 직후의 한 자가 앞 걸음에 묻히지 않게
      stepAt.current = { last: 0, start: 0 };
      setDocState(step.doc);
      setDirty(step.doc !== clean.current);
      if (from && from.settings === step.settings) return;
      setSettingsState(step.settings);
      void backend.saveSettings(step.settings).catch(() => setError("설정을 되돌리지 못했습니다."));
    },
    [backend],
  );

  const undo = useCallback(() => {
    const step = past.current.pop();
    if (!step) return;
    const from = seen.current;
    if (from) future.current.push(from);
    applyStep(step, from);
    setDepth({ past: past.current.length, future: future.current.length });
  }, [applyStep]);

  const redo = useCallback(() => {
    const step = future.current.pop();
    if (!step) return;
    const from = seen.current;
    if (from) past.current.push(from);
    applyStep(step, from);
    setDepth({ past: past.current.length, future: future.current.length });
  }, [applyStep]);

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
   * 반년이 지난 주보의 내보내기 이미지를 놓아준다.
   *
   * 주보 자체는 그대로 남는다 — 열어보기·복사해서 새로 만들기·QR로 올리기 모두 그대로다.
   * 사라지는 것은 '이미지 그대로 다시 받기' 하나뿐이고, 그마저도 주보를 열어 다시 내보내면
   * 원본 화질로 새로 나온다. 매주 한 부씩 15MB 안팎이 쌓이는 것을 그대로 두면
   * 1년 남짓에 무료 플랜 한도를 채우는데, 그 대부분이 아무도 다시 찾지 않는 것이다.
   *
   * 목록에서 키를 먼저 지운다. 파일부터 지우면 목록에는 '이미지 6장 보관'이라고 적혀 있는데
   * 받기를 누르면 아무것도 오지 않는 반쪽짜리가 된다. 파일은 이어서 도는 정리가 거둬 간다.
   */
  const retire = useCallback(
    async (nextDoc: BulletinDoc, nextLibrary: BulletinDoc[]): Promise<BulletinDoc[]> => {
      const stale = nextLibrary.filter(
        (b) =>
          b.imageKeys?.length &&
          pastKeepWindow(b.serviceDate) &&
          // 지금 QR에 올라가 있는 것은 건드리지 않는다 — 보는 사람이 있을 수 있다
          b.id !== published?.bulletinId &&
          // 지금 손대고 있는 것도 건드리지 않는다
          b.id !== nextDoc.id,
      );
      if (stale.length === 0) return nextLibrary;

      const done = new Set<string>();
      for (const b of stale) {
        try {
          await backend.setBulletinImages(b.id, []);
          done.add(b.id);
        } catch {
          // 못 지웠으면 그대로 둔다. 다음 저장 때 다시 만난다.
        }
      }
      if (done.size === 0) return nextLibrary;

      const cleared = (list: BulletinDoc[]) =>
        list.map((b) => (done.has(b.id) ? { ...b, imageKeys: [] } : b));

      setLibrary(cleared);
      return cleared(nextLibrary);
    },
    [backend, published?.bulletinId],
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
      void (async () => {
        const trimmed = await retire(nextDoc, nextLibrary);
        await backend
          .pruneImages(referencedKeys(nextDoc, trimmed, nextSettings))
          .catch(() => undefined);
      })();
    },
    [backend, retire],
  );

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await backend.saveBulletin(doc);
      const nextLibrary = [saved, ...library.filter((b) => b.id !== saved.id)].sort((a, b) =>
        b.serviceDate.localeCompare(a.serviceDate),
      );
      settle({ doc: saved, settings });
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
  }, [doc, library, settings, backend, prune, settle]);

  const openSaved = useCallback(
    (id: string) => {
      const found = library.find((b) => b.id === id);
      if (!found) return;
      const opened = deepCopy(found);
      setDocState(opened);
      setDirty(false);
      // 다른 주보다 — 앞의 주보에서 밟아온 걸음으로 되돌아갈 수는 없다
      resetHistory({ doc: opened, settings });
    },
    [library, settings, resetHistory],
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
      resetHistory({ doc: copy, settings }, false);
    },
    [library, settings, resetHistory],
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

  const removeMany = useCallback(
    async (ids: string[]): Promise<{ removed: number; failed: number }> => {
      const gone = new Set<string>();
      let failed = 0;
      let lastError: string | undefined;

      for (const id of ids) {
        try {
          await backend.deleteBulletin(id);
          gone.add(id);
        } catch (e) {
          failed += 1;
          lastError = e instanceof Error ? e.message : "삭제하지 못했습니다.";
        }
      }

      if (gone.size === 0) {
        setError(lastError);
        return { removed: 0, failed };
      }

      const nextLibrary = library.filter((b) => !gone.has(b.id));
      setError(lastError);
      setLibrary(nextLibrary);
      // 올라가 있던 주보가 그중에 있었으면 QR도 함께 비워진다 (DB에서 연결이 끊긴다)
      setPublished((p) =>
        p?.bulletinId && gone.has(p.bulletinId)
          ? { ...p, bulletinId: null, publishedAt: null }
          : p,
      );
      // 지우고 나서 한 번만 정리한다 — 한 부씩 돌리면 통 훑기를 고른 수만큼 되풀이한다
      prune(doc, nextLibrary, settings);
      return { removed: gone.size, failed };
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
    // 저장한 자리로 통째로 돌아온 것이라 그 전의 걸음은 뜻을 잃는다
    resetHistory({ doc: copy, settings: next });
    void backend.saveSettings(next).catch(() => setError("설정을 되돌리지 못했습니다."));
  }, [library, doc.id, backend, resetHistory]);

  const canRevert = dirty && library.some((b) => b.id === doc.id);
  const canUndo = depth.past > 0;
  const canRedo = depth.future > 0;

  const startNew = useCallback(() => {
    const fresh = makeDraft(settings);
    setDocState(fresh);
    setDirty(false);
    resetHistory({ doc: fresh, settings });
  }, [settings, resetHistory]);

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

      // 되돌리기로 이 이름을 물릴 수는 없다 — 옛 이름이 가리키던 파일은 아래에서 지운다.
      // 손대고 있는 주보가 그것일 때만 세운다. 아니면 아래에서 주보가 바뀌지 않아,
      // 세워둔 표시가 그대로 남아 다음에 진짜로 고친 것을 한 번 삼킨다.
      if (doc.id === docId) bookkeeping.current = true;
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

      // 원본과 그 축소본은 한 벌이다 — 남기면 아무도 안 보는 파일이 매주 쌓인다
      const stale = before.filter((k) => !keys.includes(k)).flatMap((k) => [k, webKeyFor(k)]);
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
        // 원본 옆에 폰에서 볼 축소본을 함께 둔다 — QR로 들어온 사람이 받는 것은 그쪽이다
        const keys = await putAllWithWebCopy(backend, blobs, "export");

        const saved = await backend.saveBulletin({ ...doc, imageKeys: keys });
        const at = await publishBulletin(saved.id);

        // 새 이미지가 무사히 자리 잡은 뒤에 옛 것을 지운다
        void backend
          .removeImages(old.filter((k) => !keys.includes(k)).flatMap((k) => [k, webKeyFor(k)]))
          .catch(() => {});

        const nextLibrary = [saved, ...library.filter((b) => b.id !== saved.id)].sort((a, b) =>
          b.serviceDate.localeCompare(a.serviceDate),
        );
        settle({ doc: saved, settings });
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
    [doc, library, settings, backend, prune, settle],
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
      undo,
      redo,
      canUndo,
      canRedo,
      revertToSaved,
      canRevert,
      startNew,
      attachImages,
      removeMany,
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
      undo,
      redo,
      canUndo,
      canRedo,
      revertToSaved,
      canRevert,
      startNew,
      attachImages,
      removeMany,
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

/**
 * 블록 하나를 집어 그 자리에 놓는다 (끌어 옮기기).
 *
 * ↑↓ 로만 옮기던 자리다. 다섯 번째를 맨 위로 올리려면 네 번을 눌러야 했고,
 * 그동안 목록이 한 칸씩 움직여 어디까지 왔는지 눈으로 좇아야 했다.
 */
export function moveBlockTo(blocks: FlowBlock[], id: string, toIndex: number): FlowBlock[] {
  const from = blocks.findIndex((b) => b.id === id);
  if (from < 0) return blocks;
  const to = Math.min(blocks.length - 1, Math.max(0, toIndex));
  if (from === to) return blocks;

  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function moveBlock(blocks: FlowBlock[], id: string, dir: -1 | 1): FlowBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= blocks.length) return blocks;
  const next = [...blocks];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
