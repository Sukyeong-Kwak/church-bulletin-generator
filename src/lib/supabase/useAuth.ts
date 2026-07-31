"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "./client";
import { supabaseConfigured } from "./config";
import type { AppUser } from "./types";

export interface AuthState {
  user: AppUser | null;
  loading: boolean;
  /** 서버 연동이 켜져 있는지 */
  enabled: boolean;
  signOut: () => Promise<void>;
}

/** 지금 로그인한 사용자를 읽는다. 로컬 모드에서는 항상 null. */
export function useAuth(): AuthState {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);

  // 로그인 정보는 서버에 물어봐야 알 수 있어 첫 렌더 뒤에 채운다
  useEffect(() => {
    const supabase = supabaseBrowser();
    if (!supabase) return;

    let alive = true;

    const load = async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        if (alive) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.from("users").select("*").eq("id", authUser.id).single();
      if (alive) {
        setUser(data ?? null);
        setLoading(false);
      }
    };

    void load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => void load());
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabaseBrowser()?.auth.signOut();
  }, []);

  return { user, loading, enabled: supabaseConfigured, signOut };
}
