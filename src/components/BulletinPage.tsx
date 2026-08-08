"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Txt } from "./Txt";
import { CoverTextView } from "./CoverTextView";
import { FlowBlockView } from "./FlowBlocks";
import {
  BLOCK_GAP,
  CANVAS,
  CARD,
  CONTENT,
  DEFAULT_STYLES,
  DATE_TOP,
  FOOTER,
  HEADER_GAP,
  formatServiceDate,
  monthOf,
  resolveStyle,
  yearMonth,
} from "@/lib/layout";
import { useFontsReady } from "@/lib/useFontsReady";
import type { BulletinDoc, LaidOutPage, Theme } from "@/lib/types";

/** 직접 만든 기본 퍼즐 로고 — 이미지를 따로 올리지 않아도 표지에 들어간다 */
export const DEFAULT_LOGO = "/logo/the-piece.svg";

interface PageProps {
  doc: BulletinDoc;
  page: LaidOutPage;
  /** 배경 이미지 URL (업로드본이 없으면 undefined) */
  backgroundUrl?: string;
  coverUrl?: string;
  logoUrl?: string;
}

/**
 * 891×1260 한 페이지. 실제 크기 그대로 그리며, 미리보기에서는 부모가 transform:scale 로 축소한다.
 * 내보내기는 이 노드를 그대로 pixelRatio 배율로 래스터화하므로 미리보기와 결과가 일치한다.
 */
export function BulletinPage({ doc, page, backgroundUrl, coverUrl, logoUrl }: PageProps) {
  const { theme, church, fixed } = doc;
  const isCover = page.kind === "cover";
  const bg = isCover ? (coverUrl ?? backgroundUrl) : backgroundUrl;
  const showCard = !isCover && theme.cardEnabled;

  // 광고 페이지는 머리말을 맨 위에 붙이고 남은 자리에 블록을 가운데로 두려고 세로 flex로 짠다.
  // 청년부 일정은 늘 같은 차림이라 원래대로 위에서부터 채운다.
  const cardLayout: CSSProperties =
    page.kind === "worship" ? {} : { display: "flex", flexDirection: "column" };

  return (
    <div style={{ ...canvas }} data-page={page.index}>
      {bg ? (
        // next/image는 최적화 과정에서 원본 화질을 줄이고 내보내기(html-to-image) 시
        // 캡처되지 않는 형태로 감싸기 때문에 원본 그대로 그리는 img를 쓴다
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg} alt="" style={bgImg} draggable={false} />
      ) : (
        <div style={{ ...bgImg, background: "#EFEBE2" }} />
      )}

      {/* 상단 날짜 — 한 번만 입력하면 전 페이지에 자동 반영 */}
      {(!isCover || fixed.cover.showDate) && (
        <div style={{ position: "absolute", top: DATE_TOP, left: 0, right: 0 }}>
          <Txt role="date" theme={theme}>
            {formatServiceDate(doc.serviceDate)}
          </Txt>
        </div>
      )}

      {isCover &&
        (fixed.cover.texts ?? []).map((t) => <CoverTextView key={t.id} item={t} />)}

      {isCover && fixed.cover.showLogo !== false && fixed.cover.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl ?? DEFAULT_LOGO}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: fixed.cover.logo.x,
            top: fixed.cover.logo.y,
            width: fixed.cover.logo.width,
            height: "auto",
          }}
        />
      )}

      {showCard && (
        <div
          style={{
            position: "absolute",
            left: CARD.x,
            top: CARD.y,
            width: CARD.w,
            height: CARD.h,
            borderRadius: CARD.radius,
            backgroundColor: `rgba(255,255,255,${theme.cardOpacity})`,
            padding: `${CARD.padY}px ${CARD.padX}px`,
            boxSizing: "border-box",
            overflow: "hidden",
            ...cardLayout,
          }}
        >
          {page.kind === "worship" ? (
            <WorshipContent doc={doc} />
          ) : (
            <FlowContent doc={doc} page={page} />
          )}
        </div>
      )}

      {/* 푸터 — 교회 기본정보에 저장, 매주 재입력 불필요 */}
      {!isCover && (
        <div style={{ position: "absolute", left: FOOTER.left, bottom: FOOTER.bottom }}>
          <Txt role="footer" theme={theme}>
            {church.pastorLine}
          </Txt>
          <Txt role="footer" theme={theme} style={{ marginTop: FOOTER.gap }}>
            {church.accountLine}
          </Txt>
        </div>
      )}
    </div>
  );
}

function FlowContent({ doc, page }: { doc: BulletinDoc; page: LaidOutPage }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* '청년교구 소식'은 무슨 일이 있어도 카드 맨 위에 붙는다 */}
      {page.showAdsHeader && (
        <div style={{ marginBottom: HEADER_GAP, flexShrink: 0 }}>
          <Txt role="adsHeader" theme={doc.theme}>
            청년교구 소식
          </Txt>
        </div>
      )}

      {/*
        머리말을 뺀 남은 자리에서 블록을 가운데로 둔다. 장마다 블록 수가 달라
        아래 여백이 들쭉날쭉하기 때문이다. 넘칠 때는 safe 덕분에 위가 잘리지 않고
        위에서부터 채워진다. 블록들은 이 칸의 자식이 아니라 한 겹 안에 두어,
        블록 사이 여백이 겹쳐지는 방식(마진 상쇄)이 지금과 똑같이 유지된다.
      */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "safe center" }}>
        <div>
          {page.blocks.map((b, i) => (
            <div
              key={b.id}
              style={{
                marginTop: i === 0 ? 0 : BLOCK_GAP,
                // 자리 자체는 그대로 두고 그려지는 위치만 옮긴다 — 페이지 나눔이 흔들리지 않는다
                transform: b.offsetY ? `translateY(${b.offsetY}px)` : undefined,
              }}
            >
              <FlowBlockView block={b} theme={doc.theme} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** ② 청년부 일정 — 라벨은 우측, 값은 좌측 정렬. 값이 길어 줄바꿈되면 값 컬럼에서 이어진다. */
export function WorshipContent({ doc }: { doc: BulletinDoc }) {
  const { theme, fixed, serviceDate } = doc;
  const w = fixed.worship;

  /**
   * 생일자 한 사람이 한 칸이다.
   * 줄바꿈과 '|'를 모두 칸 나눔으로 보고 흩어 담는다 — 몇 명이든 남은 자리에
   * 알아서 앉히려면 사람 단위로 쥐고 있어야 하기 때문이다.
   */
  const people = useMemo(() => {
    const lines = w.birthdays[yearMonth(serviceDate)] ?? [];
    return lines
      .flatMap((line) => line.split("|"))
      .map((n) => n.trim())
      .filter(Boolean);
  }, [w.birthdays, serviceDate]);

  /** 생일 명단이 쓸 수 있는 높이 — 카드 안쪽에서 그 위에 놓인 것을 뺀 나머지 */
  const aboveRef = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(0);

  const fontsReady = useFontsReady();
  // 위쪽에 놓인 것이 달라지면 다시 잰다. 폰트가 붙기 전 값은 폭이 달라 쓸 수 없다.
  const aboveKey = useMemo(
    () => JSON.stringify({ w, t: theme, d: serviceDate }),
    [w, theme, serviceDate],
  );

  // 위쪽 내용의 실제 높이는 그려봐야 안다 (예배 항목 수·안내 줄 수·한글 줄바꿈까지 걸려 있다).
  // 값이 같으면 이전 상태를 그대로 돌려 재렌더가 되풀이되지 않게 막는다.
  useLayoutEffect(() => {
    const h = aboveRef.current?.getBoundingClientRect().height ?? 0;
    setAbove((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, [aboveKey, fontsReady]);

  return (
    <div>
      {/*
        display:flow-root 이 있어야 잰 높이가 맞다.
        없으면 마지막 줄(생일 제목)의 아래 여백이 이 상자 밖으로 빠져나가 높이에 안 잡히고,
        그만큼 아래 명단이 자리를 더 있다고 여겨 카드 밖으로 밀린다.
      */}
      <div ref={aboveRef} style={{ display: "flow-root" }}>
        <Txt role="worshipHeading" theme={theme}>
          {w.heading}
        </Txt>

        {/*
          라벨은 가운데 거터 기준 오른쪽, 값은 왼쪽 정렬.
          두 칸을 내용 폭에 맞춰 잡고 그룹 전체를 가운데 두어야 원본과 같은 모양이 된다.
        */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto",
            justifyContent: "center",
            // 제목 '예배 안내'의 낱말 사이만큼 항목과 시간 사이를 띄운다
            columnGap: 30,
            rowGap: 2,
            alignItems: "start",
          }}
        >
          {w.rows.map((r) => (
            <FragmentRow key={r.id}>
              <Txt role="worshipLabel" theme={theme} override={w.labelStyle}>
                {r.label}
              </Txt>
              <Txt role="worshipValue" theme={theme} override={w.valueStyle} preserveLines>
                {r.value}
              </Txt>
            </FragmentRow>
          ))}
        </div>

        {/*
          차량운행처럼 매주 같은 안내.
          예배 안내 바로 아래에 둔다 — 예배가 끝나고 이어지는 일이라 그 옆에 붙어야 읽히고,
          생일은 그 달에만 해당하는 것이라 뒤로 물러난다.
        */}
        {w.noticeHeading?.trim() ? (
          <Txt role="noticeHeading" theme={theme} override={w.noticeHeadingStyle}>
            {w.noticeHeading}
          </Txt>
        ) : null}
        {w.noticeBody?.trim() ? (
          <Txt role="noticeLine" theme={theme} override={w.noticeBodyStyle} preserveLines>
            {w.noticeBody}
          </Txt>
        ) : null}

        {w.birthdayHeading && (
          <Txt role="birthdayHeading" theme={theme}>
            {w.birthdayHeading.replace("{month}", String(monthOf(serviceDate)))}
          </Txt>
        )}
      </div>

      {people.length > 0 && (
        <BirthdayNames people={people} theme={theme} avail={Math.max(0, CONTENT.h - above)} />
      )}
    </div>
  );
}

/** 한 줄에 몇 사람까지 세워볼지 — 이 가운데 글자가 가장 크게 남는 짜임을 고른다 */
const BIRTHDAY_COLS = [1, 2, 3, 4] as const;

/** 아무리 좁아도 이보다 작아지면 벽에 붙여두고 읽을 수 없다 */
const MIN_NAME_SIZE = 15;

/** 이름 칸 사이 가로 간격. 글자를 줄이면 이 사이도 같은 비율로 줄어든다. */
const NAME_GAP = 34;

/** 간격을 셈할 때 기준이 되는 크기 — 위 간격을 정한 그 크기다 */
const NAME_GAP_AT = DEFAULT_STYLES.birthdayName.fontSize;

interface Natural {
  w: number;
  h: number;
}

/**
 * 생일 명단을 남은 자리에 맞춰 앉힌다.
 *
 * 사람이 늘면 한 줄에 둘·셋·넷씩 세우고, 그래도 넘치면 글자를 줄인다.
 * 손으로 '|'를 넣어 줄을 맞추던 일을 대신하는 자리다.
 *
 * 재는 방법:
 * 짜임마다(1~4열) 화면 밖에서 제 크기로 한 번씩 그려 폭과 높이를 얻는다. 그 값으로
 * 각 짜임이 남은 자리에 들어가려면 얼마나 줄여야 하는지를 셈하고, 가장 덜 줄여도 되는
 * 짜임을 고른다. 고른 뒤에는 그 크기로 한 번만 그리므로 재고 줄이기를 되풀이하지 않는다.
 */
function BirthdayNames({
  people,
  theme,
  avail,
}: {
  people: string[];
  theme: Theme;
  avail: number;
}) {
  const fontsReady = useFontsReady();
  const probes = useRef(new Map<number, HTMLDivElement | null>());
  const [natural, setNatural] = useState<Record<number, Natural>>({});

  const key = useMemo(
    () => JSON.stringify({ people, s: theme.fontScale }),
    [people, theme.fontScale],
  );

  // 그려진 크기를 읽어 상태로 되돌리는 과정이라 effect가 아니면 알 수 없다.
  // 값이 같으면 이전 상태를 그대로 돌려 재렌더가 되풀이되지 않게 막는다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    const next: Record<number, Natural> = {};
    probes.current.forEach((el, cols) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      next[cols] = { w: r.width, h: r.height };
    });
    setNatural((prev) => (sameNatural(prev, next) ? prev : next));
  }, [key, fontsReady]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const base = resolveStyle("birthdayName", theme).fontSize;

  /** 가장 덜 줄여도 되는 짜임. 같은 값이면 열이 적은 쪽이 보기 좋다. */
  const best = useMemo(() => {
    let pick = { cols: 1, k: 0 };
    for (const cols of BIRTHDAY_COLS) {
      const n = natural[cols];
      if (!n || n.w <= 0 || n.h <= 0) continue;
      const k = Math.min(1, CONTENT.w / n.w, avail / n.h);
      // 눈에 뜨일 만큼(1% 넘게) 나아질 때만 열을 늘린다
      if (k > pick.k * 1.01) pick = { cols, k };
    }
    return pick.k > 0 ? pick : { cols: 1, k: 1 };
  }, [natural, avail]);

  const size = Math.max(MIN_NAME_SIZE, Math.floor(base * best.k));

  return (
    <>
      <div style={{ height: avail, overflow: "hidden" }}>
        <NameGrid people={people} theme={theme} cols={best.cols} size={size} />
      </div>

      {/* 짜임마다 제 크기로 한 번씩 그려 재는 자리. 화면에는 나오지 않는다. */}
      <div aria-hidden style={probeStyle}>
        {BIRTHDAY_COLS.map((cols) => (
          <div
            key={cols}
            style={{ display: "inline-block" }}
            ref={(el) => {
              probes.current.set(cols, el);
            }}
          >
            <NameGrid people={people} theme={theme} cols={cols} size={base} natural />
          </div>
        ))}
      </div>
    </>
  );
}

function NameGrid({
  people,
  theme,
  cols,
  size,
  natural,
}: {
  people: string[];
  theme: Theme;
  cols: number;
  size: number;
  /** 잴 때는 제 폭을 그대로 알아야 해서 칸을 내용만큼만 잡는다 */
  natural?: boolean;
}) {
  return (
    <div
      style={{
        display: natural ? "inline-grid" : "grid",
        gridTemplateColumns: `repeat(${cols}, max-content)`,
        justifyContent: "center",
        columnGap: NAME_GAP * (size / NAME_GAP_AT),
      }}
    >
      {people.map((n, i) => (
        <Txt
          key={`${n}-${i}`}
          role="birthdayName"
          theme={theme}
          // 한 사람 이름이 두 줄로 접히면 짜임이 무너진다 — 접지 않고 크기로 맞춘다
          style={{ fontSize: size, whiteSpace: "nowrap" }}
        >
          {n}
        </Txt>
      ))}
    </div>
  );
}

function sameNatural(a: Record<number, Natural>, b: Record<number, Natural>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => {
    const x = a[Number(k)];
    const y = b[Number(k)];
    return y && Math.abs(x.w - y.w) < 0.5 && Math.abs(x.h - y.h) < 0.5;
  });
}

/*
 * 재는 자리는 화면 밖으로 밀어 둔다.
 * fixed 가 아니라 absolute 인 까닭: 이 노드는 내보내기가 찍는 페이지 안에 들어 있다.
 * 화면 기준으로 붙는 fixed 는 그림으로 굽는 과정에서 어디에 놓일지 장담할 수 없지만,
 * absolute 는 페이지 안에서 왼쪽 바깥으로 나가므로 자리만 잡히고 찍히지는 않는다.
 */
const probeStyle: CSSProperties = {
  position: "absolute",
  left: -100000,
  top: 0,
  visibility: "hidden",
  pointerEvents: "none",
  zIndex: -1,
};

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

const canvas: CSSProperties = {
  position: "relative",
  width: CANVAS.w,
  height: CANVAS.h,
  overflow: "hidden",
  backgroundColor: "#EFEBE2",
  flexShrink: 0,
};

const bgImg: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
};
