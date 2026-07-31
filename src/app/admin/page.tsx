import { AdminPanel } from "@/components/admin/AdminPanel";
import { requireAdmin } from "@/lib/supabase/guard";
import { supabaseConfigured } from "@/lib/supabase/config";
import { Hint, Section } from "@/components/ui";

export default async function AdminPage() {
  const me = await requireAdmin();

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-3xl p-5">
        <Section title="관리자" desc="서버가 연결되면 가입 승인과 초대코드를 여기서 관리합니다.">
          <Hint>
            지금은 로그인 없이 이 브라우저에만 저장되는 상태입니다. Supabase를 연결하면 이 화면이
            켜집니다.
          </Hint>
        </Section>
      </div>
    );
  }

  return <AdminPanel meId={me!.id} />;
}
