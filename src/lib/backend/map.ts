import { makeDefaultSettings, normalizeFixed, normalizeTheme } from "@/lib/settings";
import type { BulletinRow } from "@/lib/supabase/types";
import type { BulletinDoc, ExportFormat, ExportScale } from "@/lib/types";

/** DB 행 → 화면에서 쓰는 주보 문서 */
export function rowToDoc(row: BulletinRow): BulletinDoc {
  const snap = row.snapshot ?? {};
  const base = makeDefaultSettings();

  return {
    id: row.id,
    serviceDate: row.service_date,
    updatedAt: row.updated_at,
    imageKeys: row.image_paths ?? [],
    shareToken: row.share_token ?? undefined,
    theme: normalizeTheme(snap.theme ?? base.theme),
    church: snap.church ?? base.church,
    fixed: normalizeFixed(snap.fixed ?? base.fixed),
    blocks: row.blocks ?? [],
    exportScale: (row.export_scale as ExportScale) ?? 3,
    exportFormat: (row.export_format as ExportFormat) ?? "jpg",
  };
}

/** 주보 문서 → DB 행 */
export function docToRow(doc: BulletinDoc) {
  return {
    id: doc.id,
    service_date: doc.serviceDate,
    blocks: doc.blocks,
    snapshot: { theme: doc.theme, church: doc.church, fixed: doc.fixed },
    export_scale: doc.exportScale,
    export_format: doc.exportFormat,
    image_paths: doc.imageKeys ?? [],
  };
}
