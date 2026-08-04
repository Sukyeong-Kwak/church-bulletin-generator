import type { BulletinDoc, ChurchInfo, FixedPages, FlowBlock, Theme } from "@/lib/types";

export type UserRole = "admin" | "editor";
export type UserStatus = "pending" | "approved" | "rejected" | "blocked";

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
  /** 메일 인증을 마친 시각. 아직이면 null (auth.users에서 따라 붙는다) */
  email_confirmed_at: string | null;
  /**
   * 최고 관리자. 관리자를 임명하고 내릴 수 있는 단 한 사람이다.
   * 005 마이그레이션 전에는 이 값 자체가 없다(undefined).
   */
  is_owner?: boolean;
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

/** QR 주소가 지금 보여주는 주보. 한 줄만 있다. */
export type PublishedRow = {
  id: number;
  bulletin_id: string | null;
  published_at: string | null;
  published_by: string | null;
  /**
   * 주일이 아닌 날 관리자가 열어둔 끝 시각. null이면 주일에만 열린다.
   * 009 마이그레이션 전에는 이 칸 자체가 없다 — 읽는 쪽(publish.ts)에서 없을 때를 함께 본다.
   */
  open_until: string | null;
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
  export_scale: number;
  export_format: string;
  image_paths: string[];
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
      published: {
        Row: PublishedRow;
        Insert: Partial<PublishedRow>;
        Update: Partial<PublishedRow>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      redeem_invite_code: { Args: { p_code: string }; Returns: boolean };
      /** 코드가 살아 있는지 확인만 한다. 계정을 만들기 전에 물어보는 용도라 로그인 없이도 부른다. */
      check_invite_code: { Args: { p_code: string }; Returns: boolean };
      /** 초대코드가 있어야 가입할 수 있는 상태인가 (아무도 없는 새 DB에서만 false) */
      invite_required: { Args: Record<string, never>; Returns: boolean };
      /**
       * QR 주소(/now)가 지금 보여주는 주보. 올린 것이 없으면 빈 배열.
       * 주일이 아니면 교인에게는 빈 배열을 준다 — 만드는 사람에게만 그대로 보인다.
       */
      get_current_bulletin: { Args: Record<string, never>; Returns: BulletinRow[] };
      /** 지금 교인에게 열려 있는가 (주일이거나, 관리자가 오늘 하루 열어두었거나) */
      qr_is_open: { Args: Record<string, never>; Returns: boolean };
      /** 주일이 아닌 날 오늘 하루만 연다. 닫히는 시각을 돌려준다. 관리자만. */
      open_today: { Args: Record<string, never>; Returns: string };
      /** 오늘 따로 열어둔 것을 거둔다. 주보는 그대로 올라가 있다. 관리자만. */
      close_today: { Args: Record<string, never>; Returns: void };
      /** 이 주보를 QR 주소에 올린다. 올린 시각을 돌려준다 */
      publish_bulletin: { Args: { p_id: string }; Returns: string };
      unpublish_bulletin: { Args: Record<string, never>; Returns: void };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_approved: { Args: Record<string, never>; Returns: boolean };
      is_owner: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
