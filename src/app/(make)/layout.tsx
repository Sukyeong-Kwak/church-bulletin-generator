import { MakeTabs } from "@/components/Nav";
import { requireApproved } from "@/lib/supabase/guard";

/** 주보 만들기 — 본문 작성과 전체 보기가 같은 주보를 다루는 하위 단계다 */
export default async function MakeLayout({ children }: { children: React.ReactNode }) {
  await requireApproved();

  return (
    <div className="flex h-full flex-col">
      <MakeTabs />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
