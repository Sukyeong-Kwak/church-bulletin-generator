"use client";

import { ImageUpload } from "@/components/editor/ImageUpload";
import { PreviewGrid } from "@/components/PreviewGrid";
import { SplitView } from "@/components/SplitView";
import { Field, Hint, Section, Warn } from "@/components/ui";
import { useDoc } from "@/lib/store";
import { useFitScale } from "@/lib/useFitScale";
import type { LaidOutPage } from "@/lib/types";

/**
 * 전체 공통 — 모든 페이지에 똑같이 들어가는 것들.
 * 날짜(상단), 배경 이미지(전면), 교회 정보(하단 푸터).
 * 한 번 입력하면 전 페이지에 자동 반영되므로 페이지마다 손댈 필요가 없다.
 */
export default function CommonPage() {
  const { doc, setDoc, settings, setSettings, urls, loaded } = useDoc();

  const previewScale = useFitScale(0.4, 0.5, 60);

  if (!loaded) return null;

  // 공통 요소(날짜·배경·푸터)가 어떻게 들어가는지 확인용으로 앞 두 장만 보여준다
  const samplePages: LaidOutPage[] = [
    { index: 0, kind: "cover", blocks: [], showAdsHeader: false, overflow: false },
    { index: 1, kind: "worship", blocks: [], showAdsHeader: false, overflow: false },
  ];

  return (
    <SplitView
        panel={
          <>
            <Section title="주보 날짜" desc="모든 페이지 상단에 자동으로 들어갑니다.">
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

            <Section title="교회 정보" desc="모든 페이지 하단에 두 줄로 들어갑니다.">
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
              공통 요소 확인 · 날짜와 푸터는 전 페이지 같은 자리에 들어갑니다
            </p>
            <PreviewGrid doc={doc} pages={samplePages} urls={urls} scale={previewScale} />
          </div>
        }
      />
  );
}
