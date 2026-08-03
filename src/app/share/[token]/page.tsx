import { redirect } from "next/navigation";

/**
 * 예전에 쓰던 주보별 링크.
 *
 * QR은 /now 하나로 모았다. 주소가 둘이면 어느 쪽이 최신인지 헷갈리기만 한다.
 * 이미 나간 링크가 죽지 않도록 여기서 받아 넘겨준다.
 */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  await params;
  redirect("/now");
}
