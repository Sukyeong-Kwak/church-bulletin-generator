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
  getImage(key: string): Promise<Blob | undefined>;
  /** 쓸모없어진 이미지를 지운다. 실패해도 하던 일을 멈추지 않는다. */
  removeImages(keys: string[]): Promise<void>;
  /**
   * 저장소를 훑어 `keep`에 없는 이미지를 지우고, 지운 개수를 돌려준다.
   * 지울 키를 이미 아는 removeImages와 달리, 이쪽은 '아무도 안 쓰는 것'을 직접 찾아낸다.
   * 주보를 저장하거나 지운 뒤에 불러 저장소에 지금 쓰는 것만 남게 한다.
   */
  pruneImages(keep: Set<string>): Promise<number>;
}
