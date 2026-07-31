import { SharedBulletin } from "@/components/SharedBulletin";
import { rowToDoc } from "@/lib/backend/map";
import { supabaseServer } from "@/lib/supabase/server";

/** 공유 링크(QR)로 들어오는 자리. 로그인 없이 열린다. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await supabaseServer();

  if (!supabase) return <Message title="아직 공유를 쓸 수 없습니다" desc="서버가 연결되지 않았습니다." />;

  // security definer 함수라 로그인하지 않아도 토큰이 맞으면 읽을 수 있다
  const { data } = await supabase.rpc("get_shared_bulletin", { p_token: token });
  const row = data?.[0];

  if (!row) {
    return (
      <Message
        title="주보를 찾을 수 없습니다"
        desc="링크가 잘못되었거나 주보가 삭제되었을 수 있습니다."
      />
    );
  }

  return <SharedBulletin doc={rowToDoc(row)} />;
}

function Message({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo/the-piece.svg" alt="" width={44} height={44} className="mx-auto mb-3" />
        <p className="text-[15px] font-bold">{title}</p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--ui-muted)" }}>
          {desc}
        </p>
      </div>
    </div>
  );
}
