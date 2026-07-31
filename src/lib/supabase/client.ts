"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";
import type { Database } from "./types";

export type Client = SupabaseClient<Database>;

let cached: Client | null = null;

/** 브라우저용 Supabase 클라이언트. 설정이 없으면 null(로컬 모드). */
export function supabaseBrowser(): Client | null {
  if (!supabaseConfigured) return null;
  cached ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return cached;
}
