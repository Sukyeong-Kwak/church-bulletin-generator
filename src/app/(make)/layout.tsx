import { MakeTabs } from "@/components/Nav";

/** 주보 만들기 — 본문 작성과 전체 보기가 같은 주보를 다루는 하위 단계다 */
export default function MakeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <MakeTabs />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
