/** 교회 QR로 들어왔는데 보여줄 주보가 없을 때의 안내 */
export function ShareMessage({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/the-piece.svg" alt="" width={44} height={44} className="mx-auto mb-3" />
        <p className="text-[15px] font-bold">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
          {desc}
        </p>
      </div>
    </div>
  );
}
