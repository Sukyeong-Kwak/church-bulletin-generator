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

  /** 이미지를 저장하고 다시 찾을 수 있는 키를 돌려준다 */
  putImage(blob: Blob, prefix: string): Promise<string>;
  getImage(key: string): Promise<Blob | undefined>;
  /** 쓸모없어진 이미지를 지운다. 실패해도 하던 일을 멈추지 않는다. */
  removeImages(keys: string[]): Promise<void>;
}
