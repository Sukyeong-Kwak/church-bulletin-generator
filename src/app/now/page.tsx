import type { Metadata } from "next";
import { ShareMessage } from "@/components/ShareMessage";
import { SharedView } from "@/components/SharedView";
import { rowToDoc } from "@/lib/backend/map";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * 검색에 걸리지 않게 한다.
 *
 * 전체 설정(layout.tsx)에도 같은 표시가 있지만 여기 한 번 더 적어둔다.
 * 이 화면은 로그인 없이 열리는 데다 그 달 생일 명단이 들어가는 유일한 자리라,
 * 나중에 전체 설정을 손대더라도 여기만은 열리지 않게 하려는 것이다.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * 교회 QR이 가리키는 자리. 로그인 없이 열린다.
 *
 * 주소가 하나뿐이라 입구에 붙인 QR을 매주 새로 뽑지 않아도 된다.
 * 무엇을 보여줄지는 '적용'한 주보 하나로 정해진다.
 */
export const dynamic = "force-dynamic";

export default async function NowPage() {
  const supabase = await supabaseServer();

  if (!supabase) {
    return <ShareMessage title="아직 공유를 쓸 수 없습니다" desc="서버가 연결되지 않았습니다." />;
  }

  /*
   * security definer 함수라 로그인하지 않아도 읽을 수 있다.
   * 올리지 않은 주보는 이 함수가 아예 돌려주지 않고, 주일이 아닌 날에는 교인에게 주지 않는다.
   *
   * 열려 있는지는 따로 물어본다. 둘 다 '빈 결과'로 돌아오기 때문에,
   * 왜 안 보이는지(아직 안 올라왔나 · 오늘이 주일이 아닌가)를 이것 없이는 가릴 수 없다.
   * 009 마이그레이션 전이면 이 함수가 없다 — 그때는 요일 제한도 없으므로 '열림'으로 본다.
   */
  const [bulletin, openState] = await Promise.all([
    supabase.rpc("get_current_bulletin"),
    supabase.rpc("qr_is_open"),
  ]);

  const row = bulletin.data?.[0];
  const open = openState.error ? true : openState.data !== false;

  if (!row) {
    return open ? (
      <ShareMessage
        title="아직 이번 주 주보가 올라오지 않았습니다"
        desc="준비되면 이 주소에서 바로 보실 수 있습니다. 잠시 뒤에 다시 열어주세요."
      />
    ) : (
      <ShareMessage
        title="주보는 주일에 열립니다"
        desc="이번 주 주보는 주일 아침에 이 주소에서 바로 보실 수 있습니다. QR은 그대로 두고 그날 다시 찍어주세요."
      />
    );
  }

  /*
   * 주보가 나왔는데 닫혀 있다면, 보고 있는 사람은 만드는 사람이다(함수가 승인된 사람만 통과시킨다).
   * 이 사실을 알리지 않으면 "나는 보이는데 왜 교인은 안 보인다지?"가 된다.
   */
  return (
    <>
      {!open && <StaffOnlyNotice />}
      <SharedView doc={rowToDoc(row)} />
    </>
  );
}

/**
 * 주일이 아닌 날, 만드는 사람에게만 보이고 있다는 표시.
 *
 * 화면 위에 겹치지 않고 자리를 차지하게 둔다 — 주보 화면(NowFrame)이 위쪽에 제 머리글을
 * 붙여두어서, 덮어씌우면 쪽수와 저장 버튼을 가린다.
 */
function StaffOnlyNotice() {
  return (
    <div
      className="px-3 py-2 text-center text-[12px] font-semibold leading-relaxed"
      style={{ background: "#fff4e6", color: "#b45309" }}
    >
      오늘은 주일이 아니라 교인에게는 보이지 않습니다 — 만드는 사람에게만 보이는 화면입니다.
    </div>
  );
}
