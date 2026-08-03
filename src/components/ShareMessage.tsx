import Link from "next/link";

/** QR로 들어왔는데 보여줄 주보가 없을 때의 안내 */
export function ShareMessage({
  title,
  desc,
  showNowLink,
}: {
  title: string;
  desc: string;
  /** 이번 주 주보가 있는 자리로 안내할지 */
  showNowLink?: boolean;
}) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/the-piece.svg" alt="" width={44} height={44} className="mx-auto mb-3" />
        <p className="text-[15px] font-bold">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
          {desc}
        </p>
        {showNowLink && (
          <Link
            href="/now"
            className="mt-3 inline-block text-[13px] font-bold"
            style={{ color: "var(--ui-accent)" }}
          >
            이번 주 주보 보기 →
          </Link>
        )}
      </div>
    </div>
  );
}
