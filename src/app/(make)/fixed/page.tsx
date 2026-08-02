"use client";

import { useState } from "react";
import { DEFAULT_LOGO } from "@/components/BulletinPage";
import { PreviewGrid } from "@/components/PreviewGrid";
import { SplitView } from "@/components/SplitView";
import { ImageUpload } from "@/components/editor/ImageUpload";
import { Inspector } from "@/components/Inspector";
import { Btn, Field, Hint, Section, Slider } from "@/components/ui";
import { FONTS, monthOf, yearMonth } from "@/lib/layout";
import { newId, useDoc } from "@/lib/store";
import { useFitScale } from "@/lib/useFitScale";
import type { CoverText, LaidOutPage, WorshipRow } from "@/lib/types";

type Tab = "cover" | "worship";

const TABS: { key: Tab; label: string }[] = [
  { key: "cover", label: "① 표지" },
  { key: "worship", label: "② 청년부 일정" },
];

/**
 * 고정 페이지 — 매주 바뀌지 않는 앞 두 장.
 * 여기서 저장한 내용은 이후 작성하는 모든 주보 앞에 자동으로 붙는다.
 */
export default function FixedPagesPage() {
  const { doc, urls, loaded } = useDoc();
  const [tab, setTab] = useState<Tab>("cover");
  // 좁은 화면에서는 미리보기를 화면 폭에 맞춘다
  const previewScale = useFitScale(0.4, 0.5, 60);

  if (!loaded) return null;

  // 고정 페이지 두 장을 항상 함께 보여준다
  const fixedPages: LaidOutPage[] = [
    { index: 0, kind: "cover", blocks: [], showAdsHeader: false, overflow: false },
    { index: 1, kind: "worship", blocks: [], showAdsHeader: false, overflow: false },
  ];

  return (
    <SplitView
      panel={
        <>
          <div
            className="flex gap-0.5 rounded-xl p-0.5"
            style={{ background: "#f1f2f5" }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-1 rounded-[9px] py-1.5 text-[13px] transition-colors"
                style={{
                  background: tab === t.key ? "#fff" : "transparent",
                  color: tab === t.key ? "var(--ui-text)" : "var(--ui-muted)",
                  fontWeight: tab === t.key ? 700 : 500,
                  boxShadow: tab === t.key ? "0 1px 2px rgba(16,24,40,.08)" : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "cover" ? <CoverEditor /> : <WorshipEditor />}
        </>
      }
      preview={
        <div className="min-h-0 flex-1 overflow-auto p-5">
          <p className="mb-2 text-[12px] font-bold">
            고정 페이지 미리보기 · 날짜는 작성 중인 주보({doc.serviceDate}) 기준입니다
          </p>
          <PreviewGrid doc={doc} pages={fixedPages} urls={urls} scale={previewScale} />
        </div>
      }
    />
  );
}

function CoverEditor() {
  const { settings, setSettings } = useDoc();
  const cover = settings.fixed.cover;
  const logo = cover.logo ?? { x: 286, y: 900, width: 320 };

  const setCover = (patch: Partial<typeof cover>) =>
    setSettings((s) => ({
      ...s,
      fixed: { ...s.fixed, cover: { ...s.fixed.cover, ...patch } },
    }));

  const texts = cover.texts ?? [];
  const patchText = (id: string, patch: Partial<CoverText>) =>
    setCover({ texts: texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const removeText = (id: string) => setCover({ texts: texts.filter((t) => t.id !== id) });
  const moveText = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= texts.length) return;
    const next = [...texts];
    [next[i], next[j]] = [next[j], next[i]];
    setCover({ texts: next });
  };
  const addText = () =>
    setCover({
      texts: [
        ...texts,
        {
          id: newId("ct"),
          text: "새 문구",
          kind: "line",
          y: 600,
          size: 40,
          curve: 0,
          color: "#3D3D5C",
          letterSpacing: 2,
          font: "ssurround",
        },
      ],
    });

  return (
    <>
      <Section title="표지 이미지" desc="아치형 교회명 등 표지 디자인이 포함된 이미지를 올립니다.">
        <div className="flex flex-col gap-2.5">
          <ImageUpload
            label="표지 전용 이미지"
            prefix="cover"
            checkResolution
            value={settings.theme.coverUrl}
            onChange={(key) => setSettings((s) => ({ ...s, theme: { ...s.theme, coverUrl: key } }))}
          />
          <Hint>표지 이미지를 올리지 않으면 일반 배경 이미지가 표지에도 쓰입니다.</Hint>

          <label className="flex items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={cover.showDate}
              style={{ width: "auto" }}
              onChange={(e) => setCover({ showDate: e.target.checked })}
            />
            표지 상단에 날짜 표시
          </label>
        </div>
      </Section>

      <Section
        title="표지 글자"
        desc="문구만 고치면 됩니다. 휘어짐이 양수면 가운데가 위로(∩), 음수면 아래로(∪) 휩니다."
        right={
          <Btn size="sm" onClick={addText}>
            + 줄 추가
          </Btn>
        }
      >
        <div className="flex flex-col gap-2">
          {texts.map((t, i) => (
            <div
              key={t.id}
              className="rounded-lg border p-2.5"
              style={{ borderColor: "var(--ui-border)" }}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-1">
                <input
                  type="text"
                  value={t.text}
                  placeholder="문구"
                  className="min-w-0 grow basis-[160px]"
                  onChange={(e) => patchText(t.id, { text: e.target.value })}
                />
                <div className="flex shrink-0 gap-1">
                  <Btn size="sm" variant="ghost" disabled={i === 0} onClick={() => moveText(i, -1)}>
                    ↑
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    disabled={i === texts.length - 1}
                    onClick={() => moveText(i, 1)}
                  >
                    ↓
                  </Btn>
                  <Btn size="sm" variant="danger" onClick={() => removeText(t.id)}>
                    −
                  </Btn>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Btn
                  size="sm"
                  variant={t.kind === "arch" ? "primary" : "default"}
                  onClick={() =>
                    patchText(t.id, {
                      kind: t.kind === "arch" ? "line" : "arch",
                      curve: t.kind === "arch" ? 0 : 50,
                    })
                  }
                >
                  {t.kind === "arch" ? "아치" : "직선"}
                </Btn>
                <input
                  type="color"
                  value={t.color}
                  title="글자 색"
                  onChange={(e) => patchText(t.id, { color: e.target.value })}
                  style={{ width: 30, height: 26, padding: 0, border: "none", background: "none" }}
                />
                <select
                  value={t.font ?? (t.titleFont ? "title" : "body")}
                  onChange={(e) => patchText(t.id, { font: e.target.value })}
                  style={{ width: "auto", flex: 1, minWidth: 150 }}
                >
                  {FONTS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-1.5 flex flex-col gap-1">
                <Slider
                  label="크기"
                  value={t.size}
                  min={14}
                  max={220}
                  onChange={(v) => patchText(t.id, { size: v })}
                />
                <Slider
                  label="세로 위치"
                  value={t.y}
                  min={0}
                  max={1240}
                  step={2}
                  onChange={(v) => patchText(t.id, { y: v })}
                />
                <Slider
                  label="자간"
                  value={t.letterSpacing ?? 0}
                  min={-5}
                  max={80}
                  onChange={(v) => patchText(t.id, { letterSpacing: v })}
                />
                <Slider
                  label="휘어짐"
                  value={t.curve}
                  min={-400}
                  max={400}
                  step={2}
                  disabled={t.kind !== "arch"}
                  onChange={(v) => patchText(t.id, { curve: v })}
                />
              </div>
            </div>
          ))}
          {texts.length === 0 && <Hint>표지에 들어갈 글자가 없습니다. 줄을 추가해보세요.</Hint>}
        </div>
      </Section>

      <Section
        title="퍼즐 로고"
        desc="기본 로고가 들어 있어 따로 올리지 않아도 됩니다. 미리캔버스 건별 결제가 필요 없습니다."
      >
        <div className="flex flex-col gap-2.5">
          <label className="flex items-center gap-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={cover.showLogo !== false}
              style={{ width: "auto" }}
              onChange={(e) => setCover({ showLogo: e.target.checked })}
            />
            표지에 로고 표시
          </label>

          <div className="flex items-center gap-2.5 rounded-lg p-2" style={{ background: "#f8f9fa" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={DEFAULT_LOGO} alt="" width={44} height={44} />
            <Hint>
              기본 퍼즐 로고입니다. 네 조각이 맞물려 하나를 이루는 모양으로 직접 만들었습니다.
              교회 로고가 따로 있으면 아래에서 올려 바꿀 수 있습니다.
            </Hint>
          </div>

          <ImageUpload
            label="다른 로고로 바꾸기 (배경 투명 PNG 권장)"
            prefix="logo"
            value={settings.theme.logoUrl}
            onChange={(key) => setSettings((s) => ({ ...s, theme: { ...s.theme, logoUrl: key } }))}
          />

          {cover.showLogo !== false && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="가로 위치">
                <input
                  type="number"
                  value={logo.x}
                  onChange={(e) => setCover({ logo: { ...logo, x: Number(e.target.value) } })}
                />
              </Field>
              <Field label="세로 위치">
                <input
                  type="number"
                  value={logo.y}
                  onChange={(e) => setCover({ logo: { ...logo, y: Number(e.target.value) } })}
                />
              </Field>
              <Field label="너비">
                <input
                  type="number"
                  value={logo.width}
                  onChange={(e) => setCover({ logo: { ...logo, width: Number(e.target.value) } })}
                />
              </Field>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

function WorshipEditor() {
  const { doc, settings, setSettings } = useDoc();
  const w = settings.fixed.worship;
  const [ym, setYm] = useState(yearMonth(doc.serviceDate));

  const setWorship = (patch: Partial<typeof w>) =>
    setSettings((s) => ({
      ...s,
      fixed: { ...s.fixed, worship: { ...s.fixed.worship, ...patch } },
    }));

  const setRows = (rows: WorshipRow[]) => setWorship({ rows });
  const names = w.birthdays[ym] ?? [];

  /** 빈 줄은 간격용이라 사람 수에서 뺀다 */
  const headcount = (list: string[] | undefined) => (list ?? []).filter((n) => n.trim()).length;

  const savedMonths = Object.keys(w.birthdays)
    .filter((k) => k !== ym && headcount(w.birthdays[k]) > 0)
    .sort()
    .reverse();

  return (
    <>
      <Section title="예배 안내" desc="라벨은 우측, 시간·장소는 좌측으로 자동 정렬됩니다.">
        <div className="flex flex-col gap-2">
          <Field label="페이지 제목">
            <input
              type="text"
              value={w.heading}
              onChange={(e) => setWorship({ heading: e.target.value })}
            />
          </Field>

          {/* 좁은 화면에서는 두 칸이 한 줄에 다 들어가지 않아 짜부라진다 — 넘치면 줄을 바꾼다 */}
          {w.rows.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-1.5">
              <input
                type="text"
                value={r.label}
                placeholder="항목"
                className="min-w-0 grow basis-[120px]"
                onChange={(e) =>
                  setRows(w.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <input
                type="text"
                value={r.value}
                placeholder="시간 / 장소"
                className="min-w-0 grow basis-[140px]"
                onChange={(e) =>
                  setRows(w.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                }
              />
              <div className="flex shrink-0 gap-1">
                <Btn size="sm" variant="ghost" disabled={i === 0} onClick={() => swap(i, -1)}>
                  ↑
                </Btn>
                <Btn size="sm" variant="ghost" disabled={i === w.rows.length - 1} onClick={() => swap(i, 1)}>
                  ↓
                </Btn>
                <Btn size="sm" variant="danger" onClick={() => setRows(w.rows.filter((_, j) => j !== i))}>
                  −
                </Btn>
              </div>
            </div>
          ))}

          <Btn size="sm" onClick={() => setRows([...w.rows, { id: newId("r"), label: "", value: "" }])}>
            + 항목 추가
          </Btn>
          <Hint>값에 줄바꿈을 넣으면 값 칸에서 그대로 이어집니다. (예: ZOOM ID / PW)</Hint>
        </div>
      </Section>

      <Section
        title="생일 명단"
        desc="월별로 계속 보관됩니다. 같은 달 주보에는 자동으로 들어갑니다."
      >
        <div className="flex flex-col gap-2">
          <Field label="제목 형식 ({month} 자리에 월이 들어갑니다)">
            <input
              type="text"
              value={w.birthdayHeading}
              onChange={(e) => setWorship({ birthdayHeading: e.target.value })}
            />
          </Field>

          <Field label="편집할 달">
            <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} />
          </Field>

          <Field label={`${monthOf(`${ym}-01`)}월 명단 — 한 줄에 한 명`}>
            <textarea
              rows={6}
              value={names.join("\n")}
              placeholder={"홍길동\n김철수"}
              style={{ resize: "vertical" }}
              // 적은 그대로 둔다 — 다듬어 버리면 띄어쓰기도 빈 줄도 치는 즉시 사라져
              // 이름 사이 간격을 손으로 맞출 수가 없다. 주보에도 적은 그대로 나간다.
              onChange={(e) =>
                setWorship({
                  birthdays: { ...w.birthdays, [ym]: e.target.value.split("\n") },
                })
              }
            />
          </Field>
          <Hint>띄어쓰기와 빈 줄은 적은 그대로 주보에 나옵니다.</Hint>

          {savedMonths.length > 0 && (
            <Field label="다른 달에서 명단 복사 (작년 같은 달을 그대로 쓸 때)">
              <select
                value=""
                onChange={(e) => {
                  const from = e.target.value;
                  if (!from) return;
                  setWorship({ birthdays: { ...w.birthdays, [ym]: [...(w.birthdays[from] ?? [])] } });
                }}
              >
                <option value="">선택하세요</option>
                {savedMonths.map((m) => (
                  <option key={m} value={m}>
                    {m} ({headcount(w.birthdays[m])}명)
                  </option>
                ))}
              </select>
            </Field>
          )}

          {yearMonth(doc.serviceDate) !== ym && (
            <Hint>
              작성 중인 주보는 {yearMonth(doc.serviceDate)} 명단(
              {headcount(w.birthdays[yearMonth(doc.serviceDate)])}명)을 사용합니다.
            </Hint>
          )}
        </div>
      </Section>

      <Inspector
        label="예배 안내 · 항목명"
        role="worshipLabel"
        theme={settings.theme}
        value={w.labelStyle}
        onChange={(v) => setWorship({ labelStyle: v })}
      />
      <Inspector
        label="예배 안내 · 시간·장소"
        role="worshipValue"
        theme={settings.theme}
        value={w.valueStyle}
        onChange={(v) => setWorship({ valueStyle: v })}
      />
    </>
  );

  function swap(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= w.rows.length) return;
    const next = [...w.rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  }
}
