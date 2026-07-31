"use client";

import { supabaseConfigured } from "@/lib/supabase/config";
import { localBackend } from "./local";
import { supabaseBackend } from "./supabase";
import type { Backend } from "./types";

export type { Backend } from "./types";

/**
 * 서버가 연결되어 있으면 Supabase, 아니면 이 브라우저에만 저장한다.
 * 화면 코드는 둘을 구분하지 않는다.
 */
export function getBackend(): Backend {
  return supabaseConfigured ? supabaseBackend : localBackend;
}
