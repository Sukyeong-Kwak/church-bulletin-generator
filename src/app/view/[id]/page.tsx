"use client";

import { use, useEffect, useState } from "react";
import { formatServiceDate } from "@/lib/layout";
import type { ShareMeta } from "@/lib/shareStore";

/**
 * QR을 찍은 폰이 보는 화면.
 * 올려둔 주보를 첫 장부터 순서대로 세로로 늘어놓기만 한다 —
 * 교인이 스크롤만 내리면 끝까지 읽히는 것이 목적이라 조작할 것을 두지 않았다.
 */
export default function ViewPage({ params }: PageProps<"/view/[id]">) {
  const { id } = use(params);
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/share/${id}`)
      .then(async (res) => {
        if (!alive) return;
        if (res.status === 404) return setState("missing");
        if (!res.ok) return setState("error");
        const data = (await res.json()) as { meta: ShareMeta };
        setMeta(data.meta);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state === "loading") return <Center>불러오는 중…</Center>;
  if (state === "missing") return <Center>아직 올라온 주보가 없습니다.</Center>;
  if (state === "error" || !meta) return <Center>주보를 불러오지 못했습니다.</Center>;

  return (
    <main
      className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-3 py-4"
      style={{ color: "var(--ui-text)" }}
    >
      <header className="text-center">
        <h1 className="text-[17px] font-bold">{formatServiceDate(meta.serviceDate)}</h1>
        <p className="text-[12px]" style={{ color: "var(--ui-muted)" }}>
          청년교구 주보 · 전체 {meta.count}장
        </p>
      </header>

      {Array.from({ length: meta.count }, (_, i) => (
        // 폰 데이터를 아끼려고 화면에 들어올 때 받는다
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={`/api/share/${id}/${i + 1}`}
          alt={`${i + 1}번째 장`}
          loading={i === 0 ? "eager" : "lazy"}
          className="w-full rounded-lg"
          style={{ boxShadow: "0 2px 10px rgba(0,0,0,.12)" }}
        />
      ))}

      <p className="pb-6 text-center text-[11px]" style={{ color: "var(--ui-subtle)" }}>
        이미지를 길게 누르면 폰에 저장됩니다.
      </p>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <p className="text-[13px]" style={{ color: "var(--ui-muted)" }}>
        {children}
      </p>
    </main>
  );
}
