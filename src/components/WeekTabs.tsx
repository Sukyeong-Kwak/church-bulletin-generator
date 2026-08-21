import Link from "next/link";

export interface WeekChoice {
  id: string;
  serviceDate: string;
}

/**
 * 지난 주보로 넘어가는 줄.
 *
 * 예배 직전에 한 손으로 스치듯 보는 화면이라, 고를 것을 목록으로 펼쳐 놓지 않는다.
 * 날짜 몇 개를 한 줄에 늘어놓고 누르면 그 주보가 그대로 온다.
 *
 * 화면 안에서 갈아 끼우지 않고 주소를 바꿔 다시 받아온다(?w=). 주보 다섯 부를 미리 다 들고
 * 있으면 이번 주 한 부를 보려던 사람이 다섯 부치를 받게 되고, 이 화면은 그 첫 장이 얼마나
 * 빨리 뜨는지가 전부인 자리다. 뒤로가기로 이번 주에 돌아오는 길이 저절로 생기는 것은 덤이다.
 */
export function WeekTabs({ weeks, current }: { weeks: WeekChoice[]; current: string }) {
  // 볼 것이 이번 주뿐이면 줄 자체를 내놓지 않는다 — 누를 것이 하나뿐인 줄은 군더더기다
  if (weeks.length < 2) return null;

  return (
    <nav
      aria-label="지난 주보"
      className="scroll-x mx-auto flex w-full max-w-[720px] gap-1.5 px-3 pb-2"
    >
      {weeks.map((w, i) => {
        const active = w.id === current;
        return (
          <Link
            key={w.id}
            // 이번 주는 맨 앞에 서고 주소에 표를 달지 않는다 — QR 이 가리키는 그 주소 그대로다
            href={i === 0 ? "/now" : `/now?w=${encodeURIComponent(w.id)}`}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className="shrink-0 rounded-full border px-3 py-1 text-[11.5px] whitespace-nowrap transition-colors"
            style={{
              borderColor: active ? "var(--ui-accent)" : "rgba(0,0,0,0.10)",
              background: active ? "var(--ui-accent)" : "rgba(255,255,255,0.85)",
              color: active ? "#fff" : "var(--ui-muted)",
              fontWeight: active ? 700 : 500,
            }}
          >
            {i === 0 ? "이번 주" : shortDate(w.serviceDate)}
          </Link>
        );
      })}
    </nav>
  );
}

/** '2026-08-03' → '8월 3일' — 한 줄에 여럿이 서는 자리라 해는 뺀다 */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  if (!m || !d) return iso;
  return `${Number(m)}월 ${Number(d)}일`;
}
