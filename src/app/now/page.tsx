import { ShareMessage } from "@/components/ShareMessage";
import { SharedView } from "@/components/SharedView";
import { rowToDoc } from "@/lib/backend/map";
import { supabaseServer } from "@/lib/supabase/server";

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

  // security definer 함수라 로그인하지 않아도 읽을 수 있다.
  // 올리지 않은 주보는 이 함수가 아예 돌려주지 않는다.
  const { data } = await supabase.rpc("get_current_bulletin");
  const row = data?.[0];

  if (!row) {
    return (
      <ShareMessage
        title="아직 이번 주 주보가 올라오지 않았습니다"
        desc="준비되면 이 주소에서 바로 보실 수 있습니다. 잠시 뒤에 다시 열어주세요."
      />
    );
  }

  return <SharedView doc={rowToDoc(row)} />;
}
