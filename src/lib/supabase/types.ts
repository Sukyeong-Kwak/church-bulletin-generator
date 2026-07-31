import type { BulletinDoc, ChurchInfo, FixedPages, FlowBlock, Theme } from "@/lib/types";

export type UserRole = "admin" | "editor";
export type UserStatus = "pending" | "approved" | "rejected";

/**
 * 테이블 행 타입은 반드시 `type`으로 둔다.
 * `interface`는 암묵적 인덱스 시그니처가 없어 Supabase의 스키마 제약(Record<string, unknown>)을
 * 만족하지 못하고, 그러면 rpc·select의 타입 추론이 통째로 풀린다.
 */
export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
};

export type InviteCode = {
  id: string;
  code: string;
  created_by: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked: boolean;
  created_at: string;
};

/** settings.data — 고정 페이지·교회 정보·테마 */
export type SettingsData = {
  church: ChurchInfo;
  fixed: FixedPages;
  theme: Theme;
};

export type SettingsRow = {
  id: number;
  data: SettingsData;
  updated_by: string | null;
  updated_at: string;
};

export type BulletinRow = {
  id: string;
  service_date: string;
  blocks: FlowBlock[];
  snapshot: Pick<BulletinDoc, "theme" | "church" | "fixed">;
  distribution: BulletinDoc["distribution"];
  export_scale: number;
  export_format: string;
  image_paths: string[];
  share_token: string | null;
  created_by: string | null;
  updated_at: string;
};

/**
 * 최소한의 스키마 타입.
 * `supabase gen types`로 생성할 수도 있지만 스키마가 작아 직접 적는 편이 읽기 쉽다.
 */
export type Database = {
  public: {
    Tables: {
      users: {
        Row: AppUser;
        Insert: Partial<AppUser> & { id: string; email: string };
        Update: Partial<AppUser>;
        Relationships: [];
      };
      invite_codes: {
        Row: InviteCode;
        Insert: Partial<InviteCode> & { code: string; created_by: string; expires_at: string };
        Update: Partial<InviteCode>;
        Relationships: [];
      };
      settings: {
        Row: SettingsRow;
        Insert: Partial<SettingsRow> & { data: SettingsData };
        Update: Partial<SettingsRow>;
        Relationships: [];
      };
      bulletins: {
        Row: BulletinRow;
        Insert: Partial<BulletinRow> & { service_date: string };
        Update: Partial<BulletinRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      redeem_invite_code: { Args: { p_code: string }; Returns: boolean };
      get_shared_bulletin: { Args: { p_token: string }; Returns: BulletinRow[] };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_approved: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
