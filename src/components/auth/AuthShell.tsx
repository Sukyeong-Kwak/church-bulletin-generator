"use client";

import type { ReactNode } from "react";

/** 로그인·가입 화면의 공통 껍데기 */
export function AuthShell({
  title,
  desc,
  children,
  footer,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex flex-col items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/the-piece.svg" alt="" width={48} height={48} />
          <span className="text-[15px] font-bold tracking-tight">
            THE PIECE <span style={{ color: "var(--ui-muted)" }}>주보</span>
          </span>
        </div>

        <div
          className="rounded-2xl border bg-white p-5"
          style={{ borderColor: "var(--ui-border)" }}
        >
          <h1 className="text-[16px] font-bold">{title}</h1>
          {desc && (
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--ui-muted)" }}>
              {desc}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-3">{children}</div>
        </div>

        {footer && <div className="mt-3 text-center text-[12px]">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      className="rounded-lg px-3 py-2 text-[12px] leading-relaxed"
      style={{ background: "#fff5f5", color: "#c92a2a" }}
    >
      {message}
    </p>
  );
}

export function AuthNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      className="rounded-lg px-3 py-2 text-[12px] leading-relaxed"
      style={{ background: "#f1f8f4", color: "#2b8a3e" }}
    >
      {message}
    </p>
  );
}
