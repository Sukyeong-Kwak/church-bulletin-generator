// 주보 문서 모델
// 스타일은 "테마 전역 → 페이지 타입 기본값 → 요소별 오버라이드" 순으로 병합된다.
// 오버라이드에 없는 키는 자동 기본값을 그대로 따르므로, 아무것도 건드리지 않아도 완성본이 나온다.

export type Align = "left" | "center" | "right";

/** 요소별 오버라이드. 지정한 항목만 저장된다. */
export interface TextStyle {
  fontSize?: number;
  lineHeight?: number;
  align?: Align;
  bold?: boolean;
  color?: string;
  letterSpacing?: number;
  marginTop?: number;
  marginBottom?: number;
  /** 블록 제목 노란 형광펜 배경 */
  highlight?: boolean;
}

export interface AdBlock {
  id: string;
  kind: "ad";
  title: string;
  body: string;
  pageBreakBefore?: boolean;
  titleStyle?: TextStyle;
  bodyStyle?: TextStyle;
}

export interface ScheduleItem {
  id: string;
  name: string;
  date: string;
}

export interface ScheduleBlock {
  id: string;
  kind: "schedule";
  heading: string;
  items: ScheduleItem[];
  pageBreakBefore?: boolean;
  headingStyle?: TextStyle;
  itemStyle?: TextStyle;
}

export interface SermonBlock {
  id: string;
  kind: "sermon";
  heading: string;
  title: string;
  verse: string;
  pageBreakBefore?: boolean;
  headingStyle?: TextStyle;
  lineStyle?: TextStyle;
}

/** 페이지에 흘려 담기는 블록. 순서대로 배치되며 각 블록은 쪼개지지 않는다. */
export type FlowBlock = AdBlock | ScheduleBlock | SermonBlock;

export interface WorshipRow {
  id: string;
  label: string;
  value: string;
}

/**
 * 표지에 얹는 글자 한 줄.
 * kind가 arch면 곡선을 따라 휘어지고, line이면 직선으로 놓인다.
 */
export interface CoverText {
  id: string;
  text: string;
  kind: "arch" | "line";
  /** 캔버스 기준 세로 위치 */
  y: number;
  size: number;
  /** 휘어짐 정도. 0이면 직선, 클수록 가운데가 위로 솟는다 */
  curve: number;
  color: string;
  /** 테두리 색 (없으면 테두리 없음) */
  outline?: string;
  outlineWidth?: number;
  letterSpacing?: number;
  /** 글꼴 (COVER_FONTS의 key) */
  font?: string;
  /** 글꼴 선택이 생기기 전 저장본 호환용 */
  titleFont?: boolean;
}

/** ①표지 ②청년부 일정 — 고정 페이지 관리에서 편집 */
export interface FixedPages {
  cover: {
    imageUrl?: string;
    showDate: boolean;
    /** 표지에 로고를 넣을지 */
    showLogo: boolean;
    /** 로고 위치·크기. 이미지를 따로 올리지 않으면 기본 퍼즐 로고가 쓰인다 */
    logo?: { x: number; y: number; width: number };
    /** 표지 글자 — 교회명·부서명 등. 기본값이 채워져 있고 문구만 고치면 된다 */
    texts: CoverText[];
    /** 기본 표지 서식 버전. 낮으면 새 기본 배치로 갱신된다 */
    templateVersion?: number;
  };
  worship: {
    heading: string;
    rows: WorshipRow[];
    /** '{month}월 생일' 처럼 {month} 치환 */
    birthdayHeading: string;
    /** '2026-07' → 이름 목록 */
    birthdays: Record<string, string[]>;
    labelStyle?: TextStyle;
    valueStyle?: TextStyle;
  };
}

export interface ChurchInfo {
  pastorLine: string;
  accountLine: string;
}

export interface Theme {
  name: string;
  backgroundUrl?: string;
  coverUrl?: string;
  logoUrl?: string;
  cardOpacity: number;
  cardEnabled: boolean;
  titleColor: string;
  bodyColor: string;
  highlightColor: string;
  /** 전체 폰트 크기 배율 */
  fontScale: number;
}

export type ExportScale = 2 | 3 | 4;

/** png = 무손실(용량 큼) / jpg = 고화질이지만 용량이 훨씬 작아 공유에 유리 */
export type ExportFormat = "png" | "jpg";

export interface BulletinDoc {
  id: string;
  /** 'YYYY-MM-DD' */
  serviceDate: string;
  /** 저장 시각 (ISO) */
  updatedAt?: string;
  /** 내보낸 PNG 보관 키 — 과거 주보를 다시 열어 이미지 그대로 받을 수 있다 */
  imageKeys?: string[];
  /** 공유 링크(QR) 주소에 쓰이는 토큰. 서버에 저장해야 생긴다. */
  shareToken?: string;
  theme: Theme;
  church: ChurchInfo;
  fixed: FixedPages;
  blocks: FlowBlock[];
  exportScale: ExportScale;
  exportFormat: ExportFormat;
  /** 배포 체크리스트 */
  distribution: { band: boolean; newFamily: boolean };
}

/** 조판 결과 한 페이지 */
export interface LaidOutPage {
  index: number;
  kind: "cover" | "worship" | "flow";
  blocks: FlowBlock[];
  /** 광고 블록이 있으면 '청년교구 소식' 헤더를 붙인다 */
  showAdsHeader: boolean;
  /** 이 페이지 내용이 가용 높이를 넘었는지 */
  overflow: boolean;
}
