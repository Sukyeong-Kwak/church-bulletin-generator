import { requireApproved } from "@/lib/supabase/guard";

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  await requireApproved();
  return <>{children}</>;
}
