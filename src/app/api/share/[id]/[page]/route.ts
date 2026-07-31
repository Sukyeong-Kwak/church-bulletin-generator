import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readPage, validId } from "@/lib/shareStore";

/** 올려둔 주보의 n번째 장. 폰이 이 주소로 이미지를 받아 간다. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/share/[id]/[page]">) {
  const { id, page } = await ctx.params;
  if (!validId(id)) return NextResponse.json({ message: "잘못된 주소입니다." }, { status: 400 });

  const found = await readPage(id, Number(page));
  if (!found) return NextResponse.json({ message: "그런 장이 없습니다." }, { status: 404 });

  return new NextResponse(new Uint8Array(found.bytes), {
    headers: {
      "content-type": found.ext === "png" ? "image/png" : "image/jpeg",
      // 내용이 바뀌면 주소는 그대로라도 다시 받아야 하므로 오래 캐시하지 않는다
      "cache-control": "public, max-age=60",
    },
  });
}
