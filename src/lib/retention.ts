"use client";

/**
 * 얼마나 오래, 얼마나 많이 보관하는가.
 *
 * 주보는 매주 한 부씩 쌓인다. 한 부가 저장소에 남기는 것 중 압도적으로 큰 것은
 * 내보낸 페이지 이미지다 — 인쇄와 밴드 게시를 위해 3배(2673×3780)로 굽기 때문에
 * 여섯 장이면 15MB 안팎이다. 그대로 두면 1년에 1GB 가까이 되는데, 그 선이 하필
 * Supabase 무료 플랜의 저장 한도다.
 *
 * 그런데 그 이미지는 없어도 되는 것이다. 주보 행에 그때의 스냅샷이 통째로 들어 있어서,
 * 이미지가 없으면 화면에서 다시 그린다(SharedBulletin). 즉 옛 주보의 내보내기 원본은
 * '다시 받기'라는 편의일 뿐, 주보가 남아 있느냐와는 상관이 없다.
 */

/**
 * 내보낸 이미지를 몇 주까지 들고 있을지.
 *
 * 반년이다. 지난 분기 것을 다시 받아야 하는 일은 있지만 그보다 오래된 것을 찾는 일은
 * 거의 없고, 그때는 주보를 열어 다시 내보내면 원본 화질로 새로 나온다.
 */
export const KEEP_WEEKS = 26;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 이 주보의 내보내기 이미지를 놓아줄 때가 되었는가 */
export function pastKeepWindow(serviceDate: string, now: number = Date.now()): boolean {
  const at = Date.parse(serviceDate);
  if (Number.isNaN(at)) return false; // 날짜를 못 읽으면 건드리지 않는다
  return now - at > KEEP_WEEKS * WEEK_MS;
}

/**
 * 쓸 수 있는 저장 공간.
 *
 * Storage API는 '이 통이 얼마까지 담을 수 있는지'를 알려주지 않는다. 플랜에 딸린 값이라
 * 배포하는 쪽에서 일러줘야 한다. 무료 플랜 기준인 1GB를 기본값으로 둔다 —
 * Pro로 올렸다면 NEXT_PUBLIC_STORAGE_LIMIT_MB 에 그 값을 적는다.
 */
const DEFAULT_LIMIT_MB = 1024;

export const STORAGE_LIMIT_BYTES = readLimitMb() * 1024 * 1024;

function readLimitMb(): number {
  const raw = Number(process.env.NEXT_PUBLIC_STORAGE_LIMIT_MB);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIMIT_MB;
}

/** 이 비율을 넘으면 화면에서 눈에 띄게 알린다 */
export const STORAGE_WARN_AT = 0.8;
