"use client";

import type { CSSProperties, ReactNode } from "react";
import { Txt } from "./Txt";
import { CoverTextView } from "./CoverTextView";
import { FlowBlockView } from "./FlowBlocks";
import {
  BLOCK_GAP,
  CANVAS,
  CARD,
  DATE_TOP,
  FOOTER,
  HEADER_GAP,
  formatServiceDate,
  monthOf,
  yearMonth,
} from "@/lib/layout";
import type { BulletinDoc, LaidOutPage } from "@/lib/types";

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
            // 내용을 카드 한가운데에 둔다. 넘칠 때는 safe 덕분에 위가 잘리지 않고
            // 지금처럼 위에서부터 채워진다.
            display: "flex",
            flexDirection: "column",
            justifyContent: "safe center",
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
    <div>
      {page.showAdsHeader && (
        <div style={{ marginBottom: HEADER_GAP }}>
          <Txt role="adsHeader" theme={doc.theme}>
            청년교구 소식
          </Txt>
        </div>
      )}
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
  );
}

/** ② 청년부 일정 — 라벨은 우측, 값은 좌측 정렬. 값이 길어 줄바꿈되면 값 컬럼에서 이어진다. */
export function WorshipContent({ doc }: { doc: BulletinDoc }) {
  const { theme, fixed, serviceDate } = doc;
  const w = fixed.worship;
  const names = w.birthdays[yearMonth(serviceDate)] ?? [];

  return (
    <div>
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

      {w.birthdayHeading && (
        <Txt role="birthdayHeading" theme={theme}>
          {w.birthdayHeading.replace("{month}", String(monthOf(serviceDate)))}
        </Txt>
      )}
      {names.some((n) => n.trim()) ? (
        <Txt role="birthdayName" theme={theme} preserveLines>
          {names.join("\n")}
        </Txt>
      ) : null}
    </div>
  );
}

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
