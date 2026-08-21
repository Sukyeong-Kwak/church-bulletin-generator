import type { BulletinDoc } from "@/lib/types";
import type { Settings } from "@/lib/settings";

/**
 * 저장소 인터페이스.
 *
 * 로그인 전(로컬 모드)에는 브라우저에, 로그인 후에는 Supabase에 저장한다.
 * 화면 코드는 어느 쪽인지 몰라도 되도록 같은 모양으로 맞춘다.
 */
export interface Backend {
  readonly kind: "local" | "supabase";

  loadSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;

  listBulletins(): Promise<BulletinDoc[]>;
  saveBulletin(doc: BulletinDoc): Promise<BulletinDoc>;
  deleteBulletin(id: string): Promise<void>;
  /**
   * 주보에 붙은 내보내기 이미지 목록만 바꾼다.
   * 내보내기는 저장과 별개로 일어나므로, 작성 중인 다른 수정까지 함께 올리지 않는다.
   */
  setBulletinImages(id: string, keys: string[]): Promise<void>;

  /** 이미지를 저장하고 다시 찾을 수 있는 키를 돌려준다 */
  putImage(blob: Blob, prefix: string): Promise<string>;
  /** 키를 직접 정해서 저장한다. 원본과 짝을 이루는 화면용 축소본을 둘 때 쓴다. */
  putImageAt(key: string, blob: Blob): Promise<void>;
  getImage(key: string): Promise<Blob | undefined>;
  /**
   * 화면에 바로 걸 수 있는 주소. 없거나 볼 수 없는 키 자리에는 null이 온다.
   *
   * getImage로 받아 blob 주소를 만들면 브라우저 캐시도 CDN 캐시도 타지 않아
   * 화면을 새로 열 때마다 통째로 다시 받는다. 이쪽은 주소만 받아 오므로
   * 실제 내려받기는 브라우저가 맡는다 — 여러 장을 한꺼번에, 뜨는 대로 그리고, 캐시에 남긴다.
   *
   * 원본 화질이 그대로 필요한 곳(내보내기·저장)은 여전히 getImage를 쓴다.
   * ttlSeconds는 그 주소가 살아 있을 시간이다 — URL_TTL 을 쓴다.
   */
  imageUrls(keys: string[], ttlSeconds?: number): Promise<(string | null)[]>;
  /** imageUrls로 받은 주소를 놓아준다. 브라우저 안에 만든 주소만 실제로 거둘 것이 있다. */
  releaseUrls(urls: (string | null | undefined)[]): void;
  /** 쓸모없어진 이미지를 지운다. 실패해도 하던 일을 멈추지 않는다. */
  removeImages(keys: string[]): Promise<void>;
  /**
   * 저장소를 훑어 `keep`에 없는 이미지를 지우고, 지운 개수를 돌려준다.
   * 지울 키를 이미 아는 removeImages와 달리, 이쪽은 '아무도 안 쓰는 것'을 직접 찾아낸다.
   * 주보를 저장하거나 지운 뒤에 불러 저장소에 지금 쓰는 것만 남게 한다.
   */
  pruneImages(keep: Set<string>): Promise<number>;

  /**
   * 저장소를 얼마나 쓰고 있는지. 알 수 없으면 null.
   *
   * 매주 한 부씩 쌓이는 것이라 '언젠가 찬다'가 아니라 '몇 부 뒤에 찬다'가 답이 되어야 한다.
   * 그 답을 내려면 지금 쓰는 양을 실제로 세어야 한다 — 통을 훑는 일이라 화면에서 필요할 때만 부른다.
   */
  storageUsage(): Promise<StorageUsage | null>;
}

export interface StorageUsage {
  /** 지금 쓰고 있는 바이트 */
  bytes: number;
  /** 들어 있는 파일 수 */
  files: number;
  /**
   * 담을 수 있는 최대 바이트. 알 수 없으면 null —
   * 그때는 남은 양 대신 쓰는 양만 보여준다.
   */
  limitBytes: number | null;
}
