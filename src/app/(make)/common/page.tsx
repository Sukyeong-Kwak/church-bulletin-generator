"use client";

import { useMemo } from "react";
import { ImageUpload } from "@/components/editor/ImageUpload";
import { PreviewGrid } from "@/components/PreviewGrid";
import { SplitView } from "@/components/SplitView";
import { Field, Hint, Section, Slider, SliderEnds, Warn } from "@/components/ui";
import { grayColor, grayLevel } from "@/lib/layout";
import { useFlowPages, withFixedPages } from "@/lib/paginate";
import { useDoc } from "@/lib/store";
import { useEditFocus } from "@/lib/useEditFocus";
import { useFitScale } from "@/lib/useFitScale";

/**
 * 전체 공통 — 모든 페이지에 똑같이 들어가는 것들.
 * 날짜(상단), 배경 이미지(전면), 교회 정보(하단 푸터).
 * 한 번 입력하면 전 페이지에 자동 반영되므로 페이지마다 손댈 필요가 없다.
 */
export default function CommonPage() {
  const { doc, setDoc, settings, setSettings, urls, loaded } = useDoc();
  const { pages: flowPages, measurer } = useFlowPages(doc);

  /*
   * 표지 · 일정 · 본문 한 장씩 세운다.
   *
   * 여기서 고치는 것(날짜·배경·카드·교회 정보)은 모든 장에 똑같이 들어간다.
   * 그런데 고정 두 장만 보여주면 본문 장에 어떻게 앉는지가 안 보여
   * '여기 것이 저기에도 들어가는가'가 애매해진다.
   * 그렇다고 다 세우면 전체 보기와 같은 화면이 되므로, 종류마다 하나씩만 세운다.
   */
  const samplePages = useMemo(() => {
    const all = withFixedPages(flowPages);
    const first = all.find((p) => p.kind === "flow");
    return first ? [...all.slice(0, 2), first] : all.slice(0, 2);
  }, [flowPages]);

  const previewScale = useFitScale(0.4, 0.5, 60);
  const { goEdit } = useEditFocus();

  if (!loaded) return null;

  return (
    <>
    <SplitView
        panel={
          <>
            <Section
              anchor="common.date"
              title="주보 날짜"
              desc="모든 페이지 상단에 자동으로 들어갑니다."
            >
              <Field label="예배 날짜">
                <input
                  type="date"
                  value={doc.serviceDate}
                  onChange={(e) => setDoc((d) => ({ ...d, serviceDate: e.target.value }))}
                />
              </Field>
              <div className="mt-1.5">
                <Hint>
                  날짜를 바꾸면 표지부터 마지막 장까지 한 번에 바뀝니다. 생일 명단도 해당 월로
                  자동 전환됩니다.
                </Hint>
              </div>
            </Section>

            <Section
              anchor="theme.background"
              title="배경 이미지"
              desc="모든 페이지의 배경으로 쓰입니다. (표지만 다르게 하려면 고정 페이지에서 표지 전용 이미지를 올리세요)"
            >
              <ImageUpload
                label="배경 (날짜 없는 버전)"
                prefix="bg"
                checkResolution
                value={doc.theme.backgroundUrl}
                onChange={(key) =>
                  setDoc((d) => ({ ...d, theme: { ...d.theme, backgroundUrl: key } }))
                }
              />
              {!doc.theme.backgroundUrl && (
                <div className="mt-2">
                  <Warn>배경을 올리기 전에는 단색으로 표시됩니다.</Warn>
                </div>
              )}
            </Section>

            <Section
              anchor="theme.card"
              title="글자 잘 보이게"
              desc="배경 사진 때문에 글씨가 묻힐 때 조절합니다. 오른쪽 미리보기로 바로 확인하세요."
            >
              <div className="flex flex-col gap-3">
                <div>
                  <Slider
                    label="배경 덮기"
                    min={0}
                    max={100}
                    value={Math.round(doc.theme.cardOpacity * 100)}
                    format={(v) => `${v}%`}
                    onChange={(v) =>
                      setSettings((s) => ({ ...s, theme: { ...s.theme, cardOpacity: v / 100 } }))
                    }
                  />
                  <SliderEnds left="사진 그대로" right="흰 종이처럼" />
                </div>

                <div>
                  <Slider
                    label="글자색"
                    min={0}
                    max={100}
                    value={grayLevel(doc.theme.bodyColor)}
                    track="linear-gradient(to right, #000, #fff)"
                    onChange={(v) =>
                      setSettings((s) => ({ ...s, theme: { ...s.theme, bodyColor: grayColor(v) } }))
                    }
                  />
                  <SliderEnds left="검정" right="흰색" />
                </div>

                <Hint>
                  배경을 많이 덮을수록 글씨가 또렷해집니다. 반대로 사진을 살리고 싶다면 덮기를
                  줄이고, 사진이 어두우면 글자색을 흰색 쪽으로 옮기세요. (제목 색은 그대로입니다)
                </Hint>
              </div>
            </Section>

            <Section
              anchor="common.church"
              title="교회 정보"
              desc="모든 페이지 하단에 두 줄로 들어갑니다."
            >
              <div className="flex flex-col gap-2">
                <Field label="담당 목사">
                  <input
                    type="text"
                    value={settings.church.pastorLine}
                    placeholder="담당 목사  |  이름(연락처)"
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        church: { ...s.church, pastorLine: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="계좌">
                  <input
                    type="text"
                    value={settings.church.accountLine}
                    placeholder="청년교구 계좌  |  은행 000-0000-0000"
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        church: { ...s.church, accountLine: e.target.value },
                      }))
                    }
                  />
                </Field>
                <Hint>
                  한 번 입력해두면 다음 주보에도 그대로 이어집니다. 개인정보라 나중에 로그인한
                  사람만 볼 수 있게 됩니다.
                </Hint>
              </div>
            </Section>
          </>
        }
        preview={
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <p className="mb-2 text-[12px] font-bold">
              장 종류마다 한 장씩 · 여기서 고친 것은 모든 장에 똑같이 들어갑니다
            </p>
            <PreviewGrid doc={doc} pages={samplePages} urls={urls} scale={previewScale} onEdit={goEdit} />
            <div className="mt-2">
              <Hint>고치고 싶은 자리를 주보에서 바로 누르면 그 칸으로 갑니다.</Hint>
            </div>
          </div>
        }
      />
      {/* 본문 한 장을 세우려면 블록 높이를 재야 한다 — 화면 밖에서 재는 자리 */}
      {measurer}
    </>
  );
}
