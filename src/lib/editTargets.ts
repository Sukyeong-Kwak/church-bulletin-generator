/**
 * 주보의 어느 구역을 어느 화면 어느 칸에서 고치는가.
 *
 * 고치는 자리가 세 화면에 흩어져 있다. 주보를 보고 있으면 그 중 어디인지 알 방법이 없어,
 * "이 줄은 어디서 고치더라"를 매번 헤매게 된다.
 *
 * 그래서 주보 쪽 구역에 이름표를 달고(data-edit), 그 이름표가 어느 화면 어느 칸인지를
 * 여기 한 곳에만 적어둔다. 미리보기에서 누르면 이 표를 보고 그 자리로 데려간다.
 *
 * 이름표를 새로 달았는데 여기 적지 않으면 눌러도 아무 일이 없다 —
 * 그래서 표를 나눠 적지 않고 이 파일 하나로 둔다.
 */

/** 옮겨간 화면에게 '무엇을 찾아가야 하는지' 알리는 주소 조각 */
export const EDIT_PARAM = "edit";

export interface EditRoute {
  /** 고치는 화면 */
  href: string;
  /** 마우스를 올렸을 때 보여줄 말 */
  label: string;
}

/** 블록은 문서마다 달라 이름표에 id를 실어 보낸다 */
const BLOCK_PREFIX = "block:";

export function blockTarget(id: string): string {
  return `${BLOCK_PREFIX}${id}`;
}

/** 표지 글도 여러 개라 id를 실어 보낸다 */
const COVER_TEXT_PREFIX = "cover.text:";

export function coverTextTarget(id: string): string {
  return `${COVER_TEXT_PREFIX}${id}`;
}

const COMMON: Record<string, string> = {
  "common.date": "주보 날짜",
  "theme.background": "배경 이미지",
  "theme.card": "글자 잘 보이게",
  "common.church": "교회 정보",
};

const FIXED: Record<string, string> = {
  "cover.image": "표지 이미지",
  "cover.logo": "표지 로고",
  "cover.texts": "표지 글",
  "worship.heading": "청년부 일정 · 제목",
  "worship.rows": "예배 안내",
  "worship.notice": "고정 안내 (차량운행)",
  "worship.birthdays": "생일",
};

/**
 * 이 이름표는 어디로 데려가야 하는가.
 * 모르는 이름표면 null — 누르는 시늉도 하지 않는다.
 */
export function editRoute(target: string): EditRoute | null {
  if (target.startsWith(BLOCK_PREFIX)) {
    return { href: "/", label: "작성 · 이 블록" };
  }

  if (target.startsWith(COVER_TEXT_PREFIX)) {
    return { href: "/fixed", label: "고정 페이지 · 표지 글" };
  }

  // 모든 장에 똑같이 들어가는 것들은 고정 페이지가 아니라 공통 화면에서 고친다
  const common = COMMON[target];
  if (common) return { href: "/common", label: `전체 공통 · ${common}` };

  const name = FIXED[target];
  return name ? { href: "/fixed", label: `고정 페이지 · ${name}` } : null;
}

/**
 * 표지 글은 여럿이라 id마다 이름표가 다르지만, 고치는 칸은 '표지 글' 하나다.
 * 화면 쪽에서 찾을 때 쓰는 이름으로 바꿔준다.
 */
export function targetAnchor(target: string): string {
  if (target.startsWith(COVER_TEXT_PREFIX)) return "cover.texts";
  // 장 제목은 예배 안내 칸 안에 있다 — 따로 데려갈 자리가 없다
  if (target === "worship.heading") return "worship.rows";
  return target;
}
