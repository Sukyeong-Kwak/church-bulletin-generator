import { PIECES } from "@/lib/brand";

/**
 * 교회 QR로 들어왔는데 보여줄 주보가 없을 때의 안내.
 *
 * 여기까지 온 사람은 이미 QR을 찍은 뒤다. 빈 화면을 보여주면 '고장 났나' 싶어
 * 다시 찍어 보게 되므로, 자리를 갖춘 카드 한 장으로 "곧 올라온다"는 것만 알린다.
 */
export function ShareMessage({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      className="relative flex min-h-full items-center justify-center overflow-hidden p-6"
      style={{ background: "#eff1f4" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(90% 55% at 12% 0%, rgba(65,80,143,0.15), transparent 62%),
            radial-gradient(90% 55% at 88% 4%, rgba(229,107,78,0.14), transparent 62%)`,
        }}
      />

      <div
        className="now-rise relative w-full max-w-[360px] overflow-hidden rounded-3xl bg-white px-7 py-9 text-center"
        style={{ boxShadow: "0 1px 3px rgba(16,24,40,0.08), 0 12px 32px rgba(16,24,40,0.08)" }}
      >
        {/* 카드 머리에 네 조각을 얹어 둔다 — 문구를 읽기 전에 어느 교회 주보인지 안다 */}
        <div className="absolute inset-x-0 top-0 flex h-[3px]">
          {PIECES.map((c) => (
            <div key={c} style={{ background: c, flex: 1 }} />
          ))}
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/the-piece.svg" alt="" width={46} height={46} className="mx-auto" />
        <p className="mt-4 text-[16px] font-bold leading-snug">{title}</p>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
          {desc}
        </p>

        <div className="mt-7 flex justify-center gap-1.5">
          {PIECES.map((c, i) => (
            <span
              key={c}
              className="now-rise"
              style={{
                background: c,
                width: 6,
                height: 6,
                borderRadius: 2,
                animationDelay: `${200 + i * 110}ms`,
              }}
            />
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--ui-subtle)" }}>
          우리는 하나님의 퍼즐의 한 조각
          <br />
          THE PIECE 주보
        </p>
      </div>
    </div>
  );
}
