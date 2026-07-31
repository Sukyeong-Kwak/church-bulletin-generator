import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  MAX_BYTES,
  MAX_PAGES,
  lanOrigins,
  readMeta,
  removeShare,
  saveShare,
  validId,
  type ShareMeta,
} from "@/lib/shareStore";

/**
 * 폰으로 보여줄 주보 한 부.
 *
 * POST  이미지 묶음을 올린다 (주보 id 기준이라 다시 내보내도 QR 주소는 그대로다)
 * GET   몇 장인지·언제 올렸는지
 * DELETE 올린 것을 내린다
 */

export interface SharePostResponse {
  id: string;
  meta: ShareMeta;
  /** 폰이 열 수 있는 주소 후보. 첫 번째가 가장 그럴듯한 것. */
  urls: string[];
}

const ALLOWED_EXT = new Set(["jpg", "png"]);

export async function POST(request: NextRequest, ctx: RouteContext<"/api/share/[id]">) {
  const { id } = await ctx.params;
  if (!validId(id)) return bad("주보 번호가 올바르지 않습니다.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("올린 내용을 읽지 못했습니다.");
  }

  const ext = String(form.get("ext") ?? "jpg");
  if (!ALLOWED_EXT.has(ext)) return bad("이미지 형식은 jpg 또는 png만 됩니다.");

  const serviceDate = String(form.get("serviceDate") ?? "");
  const files = form.getAll("page").filter((f): f is File => f instanceof File);

  if (files.length === 0) return bad("올릴 이미지가 없습니다.");
  if (files.length > MAX_PAGES) return bad(`한 번에 ${MAX_PAGES}장까지 올릴 수 있습니다.`);
  if (files.some((f) => f.size > MAX_BYTES)) {
    return bad("한 장이 너무 큽니다. 화질을 낮추거나 JPG로 내보내 주세요.");
  }

  const pages = await Promise.all(
    files.map(async (f) => new Uint8Array(await f.arrayBuffer())),
  );

  const meta = await saveShare(id, { serviceDate, ext }, pages);
  return NextResponse.json<SharePostResponse>({ id, meta, urls: viewUrls(request, id) });
}

export async function GET(request: NextRequest, ctx: RouteContext<"/api/share/[id]">) {
  const { id } = await ctx.params;
  if (!validId(id)) return bad("주보 번호가 올바르지 않습니다.");

  const meta = await readMeta(id);
  if (!meta) return NextResponse.json({ message: "올려둔 주보가 없습니다." }, { status: 404 });

  return NextResponse.json({ id, meta, urls: viewUrls(request, id) });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/share/[id]">) {
  const { id } = await ctx.params;
  if (!validId(id)) return bad("주보 번호가 올바르지 않습니다.");
  await removeShare(id);
  return NextResponse.json({ id, removed: true });
}

/**
 * 만든 사람이 localhost로 열어두면 QR에 localhost가 박혀 폰에서 열리지 않는다.
 * 그래서 서버가 자기 랜 주소를 먼저 알려주고, 지금 접속한 주소를 뒤에 둔다.
 */
function viewUrls(request: NextRequest, id: string): string[] {
  const here = request.nextUrl;
  const port = here.port || (here.protocol === "https:" ? "443" : "80");
  const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(here.hostname);

  const origins = [
    ...(isLocal ? lanOrigins(port, here.protocol.replace(":", "")) : []),
    here.origin,
  ];

  return [...new Set(origins)].map((o) => `${o}/view/${id}`);
}

function bad(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}
