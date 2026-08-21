"use client";

import { useEffect, useState } from "react";
import { getBackend } from "@/lib/backend";
import type { StorageUsage } from "@/lib/backend/types";
import { formatBytes } from "@/lib/exportImages";
import { KEEP_WEEKS, STORAGE_WARN_AT } from "@/lib/retention";
import type { BulletinDoc } from "@/lib/types";
import { Btn, Hint, Section, Warn } from "./ui";

/**
 * 저장 공간이 얼마나 남았는가.
 *
 * '언젠가 찬다'는 말은 아무 도움이 안 된다. 주보는 매주 한 부씩 쌓이는 것이라
 * 답은 '몇 부 더 저장할 수 있는가'여야 한다. 그래서 지금 쓰는 양을 실제로 세고,
 * 보관 중인 주보 수로 나눠 한 부당 값을 낸 뒤, 남은 자리를 그 값으로 나눈다.
 *
 * 통을 훑는 일이라 자동으로 세지 않는다. 이 화면에 들어올 때 한 번 센다.
 */
export function StorageMeter({ library }: { library: BulletinDoc[] }) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [state, setState] = useState<"loading" | "done" | "unknown">("loading");
  /** 올리면 다시 센다 — '다시 세기'가 누르는 자리 */
  const [round, setRound] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const got = await getBackend().storageUsage();
        if (!alive) return;
        setUsage(got);
        setState(got ? "done" : "unknown");
      } catch {
        if (!alive) return;
        setUsage(null);
        setState("unknown");
      }
    })();

    return () => {
      alive = false;
    };
  }, [round]);

  const measure = () => {
    setState("loading");
    setRound((n) => n + 1);
  };

  if (state === "loading" && !usage) {
    return (
      <Section title="저장 공간">
        <Hint>세는 중입니다…</Hint>
      </Section>
    );
  }

  if (!usage) {
    return (
      <Section title="저장 공간">
        <Hint>지금은 저장 공간을 확인할 수 없습니다.</Hint>
      </Section>
    );
  }

  const { bytes, files, limitBytes } = usage;
  const ratio = limitBytes ? Math.min(1, bytes / limitBytes) : 0;
  const tight = limitBytes ? ratio >= STORAGE_WARN_AT : false;

  /*
   * 한 부당 얼마나 쓰는가.
   *
   * 미리 정해둔 값이 아니라 지금 통에 든 것을 실제로 나눈 값이다 — 배경 사진 크기도,
   * 내보내는 배율도 교회마다 다르므로 짐작으로 적으면 몇 배씩 어긋난다.
   *
   * 나누는 수는 '이미지를 들고 있는 주보'다. 보관함 전체로 나누면 안 된다 —
   * 반년이 지나 이미지를 놓아준 주보까지 세면 한 부당 값이 실제의 절반으로 보이고,
   * 그러면 앞으로 몇 부를 더 넣을 수 있는지가 두 배로 부풀려진다.
   * 남은 자리를 알려주는 숫자는 넉넉한 쪽보다 빠듯한 쪽으로 틀리는 편이 낫다.
   */
  const imaged = library.filter((b) => b.imageKeys?.length).length;
  const perBulletin = imaged > 0 ? bytes / imaged : 0;
  const left = limitBytes ? Math.max(0, limitBytes - bytes) : 0;
  const moreSaves = limitBytes && perBulletin > 0 ? Math.floor(left / perBulletin) : null;

  return (
    <Section
      title="저장 공간"
      right={
        <Btn size="sm" disabled={state === "loading"} onClick={measure}>
          {state === "loading" ? "세는 중…" : "다시 세기"}
        </Btn>
      }
    >
      <div className="flex flex-col gap-2">
        {limitBytes ? (
          <>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full"
              style={{ background: "#eceef1" }}
              role="img"
              aria-label={`${Math.round(ratio * 100)}퍼센트 사용 중`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, ratio * 100)}%`,
                  background: tight ? "#e8590c" : "var(--ui-accent)",
                  transition: "width .3s",
                }}
              />
            </div>
            <p className="text-[13px]">
              <span className="font-bold">{formatBytes(bytes)}</span>
              <span style={{ color: "var(--ui-muted)" }}> / {formatBytes(limitBytes)} 사용</span>
              <span style={{ color: "var(--ui-muted)" }}> · {Math.round(ratio * 100)}%</span>
            </p>
          </>
        ) : (
          <p className="text-[13px]">
            <span className="font-bold">{formatBytes(bytes)}</span>
            <span style={{ color: "var(--ui-muted)" }}> 사용 중 (한도를 알 수 없습니다)</span>
          </p>
        )}

        <p className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
          주보 {library.length}부 (이미지 보관 {imaged}부) · 파일 {files}개
          {perBulletin > 0 && ` · 한 부에 평균 ${formatBytes(perBulletin)}`}
        </p>

        {moreSaves === null ? (
          /*
           * 한 부당 값을 낼 근거가 없다.
           *
           * 아직 한 번도 내보내지 않았거나, 보관 중인 것이 모두 반년을 넘겨 이미지를 놓아준
           * 상태다. 이때 아무 말도 안 하면 '몇 부 더 넣을 수 있나'가 소리 없이 사라지므로,
           * 왜 못 알려주는지를 대신 적는다 — 짐작한 숫자를 적는 것보다 낫다.
           */
          <Hint>
            아직 내보낸 주보가 없어 한 부당 크기를 알 수 없습니다. 한 번 내보내고 저장하면 여기에
            몇 부를 더 넣을 수 있는지 나옵니다.
          </Hint>
        ) : moreSaves > 0 ? (
          <p className="text-[13px] font-semibold">
            지금 쓰는 만큼이면 약 <span style={{ color: "var(--ui-accent)" }}>{moreSaves}부</span>를
            더 저장할 수 있습니다 (약 {moreSaves}주치).
          </p>
        ) : (
          /*
           * 한 부도 더 안 들어간다.
           *
           * 쓴 비율과는 별개다 — 남은 자리가 한 부 크기보다 작으면 절반만 썼어도 여기로 온다.
           * 그러니 '거의 찼다'가 아니라 얼마가 모자란지를 적는다. 40%가 비어 있는데
           * '거의 찼습니다'라고 하면 화면이 거짓말을 하는 것이 된다.
           */
          <Warn>
            남은 자리가 {formatBytes(left)}인데 주보 한 부에 평균 {formatBytes(perBulletin)}이
            듭니다. 지금 상태로는 한 부도 더 저장할 수 없습니다 — 보관함에서 지난 주보를 골라
            지우면 자리가 생깁니다.
          </Warn>
        )}

        {tight && moreSaves !== null && moreSaves > 0 && (
          <Warn>
            저장 공간을 {Math.round(ratio * 100)}% 썼습니다. 지난 주보를 정리해 두시면
            여유가 생깁니다.
          </Warn>
        )}

        <Hint>
          {KEEP_WEEKS}주가 지난 주보의 내보내기 이미지는 저장할 때 자동으로 정리됩니다. 주보 자체는
          그대로 남아 열어보고 복사할 수 있고, 필요하면 다시 열어 내보내면 원본 화질로 새로 만들어집니다.
          그래서 실제로는 {KEEP_WEEKS}부 언저리에서 더 늘지 않습니다.
        </Hint>
      </div>
    </Section>
  );
}
