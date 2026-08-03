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
    theme: normalizeTheme(snap.theme ?? base.theme),
    church: snap.church ?? base.church,
    fixed: normalizeFixed(snap.fixed ?? base.fixed),
    blocks: row.blocks ?? [],
    exportScale: (row.export_scale as ExportScale) ?? 3,
    exportFormat: (row.export_format as ExportFormat) ?? "jpg",
  };
}

/**
 * 스냅샷에 넣을 고정 페이지.
 *
 * 생일 명단은 달마다 쌓여 있지만, 주보에 그려지는 것은 그 달 하나뿐이다.
 * 공유 링크는 주보 행을 통째로 내려주므로, 나머지 달을 그대로 실어 보내면
 * 링크를 받은 사람이 화면에 없는 명단까지 들여다볼 수 있다. 여기서 잘라낸다.
 */
function fixedForSnapshot(doc: BulletinDoc) {
  const ym = doc.serviceDate.slice(0, 7);
  const w = doc.fixed.worship;
  const thisMonth = w.birthdays?.[ym];

  return {
    ...doc.fixed,
    worship: { ...w, birthdays: thisMonth ? { [ym]: thisMonth } : {} },
  };
}

/** 주보 문서 → DB 행 */
export function docToRow(doc: BulletinDoc) {
  return {
    id: doc.id,
    service_date: doc.serviceDate,
    blocks: doc.blocks,
    snapshot: { theme: doc.theme, church: doc.church, fixed: fixedForSnapshot(doc) },
    export_scale: doc.exportScale,
    export_format: doc.exportFormat,
    image_paths: doc.imageKeys ?? [],
  };
}
