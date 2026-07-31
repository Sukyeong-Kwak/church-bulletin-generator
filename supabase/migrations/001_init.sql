-- THE PIECE 주보 — 초기 스키마
--
-- 접근 통제는 RLS로 DB 레벨에서 한다. 화면을 우회해도 승인받지 않은 사람은 아무것도 볼 수 없다.
--   pending  가입 신청만 한 상태 — 자기 정보만 읽힌다
--   editor   승인됨 — 주보 작성·수정 가능
--   admin    승인 권한 + 초대코드 발급
--
-- Supabase 대시보드 > SQL Editor 에 그대로 붙여넣어 실행한다.

-- ---------------------------------------------------------------- 사용자

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null default '',
  role        text not null default 'editor'  check (role   in ('admin', 'editor')),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.users is '가입자. auth.users와 1:1로 붙고 승인 상태를 담는다.';

-- 승인 여부 확인 — 정책 안에서 users를 다시 조회하면 재귀가 되므로
-- security definer 함수로 감싸 RLS를 우회한다.
create or replace function public.is_approved()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

-- 가입하면 users 행을 만든다.
-- 첫 가입자는 관리자가 되고 바로 승인된다. (승인해줄 사람이 아직 없으므로)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.users;

  insert into public.users (id, email, name, role, status, approved_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    case when first_user then 'admin'  else 'editor'  end,
    case when first_user then 'approved' else 'pending' end,
    case when first_user then now() end
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.users enable row level security;

-- 자기 정보는 언제나 읽는다 (승인 대기 화면을 보여줘야 하므로)
create policy "자기 정보 읽기" on public.users
  for select using (id = auth.uid());

-- 승인된 사람은 서로를 볼 수 있다 (작성자 표시용)
create policy "승인자는 목록 읽기" on public.users
  for select using (public.is_approved());

-- 이름 정도만 스스로 고친다. 역할·상태는 손대지 못한다.
create policy "자기 이름 수정" on public.users
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and role   = (select role   from public.users where id = auth.uid())
    and status = (select status from public.users where id = auth.uid())
  );

create policy "관리자는 전체 수정" on public.users
  for update using (public.is_admin());

-- ---------------------------------------------------------------- 초대코드

create table if not exists public.invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  created_by uuid not null references public.users(id),
  expires_at timestamptz not null,
  max_uses   int not null default 10,
  used_count int not null default 0,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);

comment on column public.invite_codes.expires_at is '발급 후 24시간. 지나면 쓸 수 없다.';

alter table public.invite_codes enable row level security;

create policy "관리자만 초대코드 관리" on public.invite_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- 코드로 가입 즉시 승인.
-- 아직 pending인 본인만 대상으로 하고, 유효한 코드일 때만 통과한다.
create or replace function public.redeem_invite_code(p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  target public.invite_codes%rowtype;
begin
  select * into target
  from public.invite_codes
  where upper(code) = upper(trim(p_code))
    and not revoked
    and expires_at > now()
    and used_count < max_uses
  for update;

  if not found then
    return false;
  end if;

  update public.invite_codes
     set used_count = used_count + 1
   where id = target.id;

  update public.users
     set status = 'approved', approved_at = now(), approved_by = target.created_by
   where id = auth.uid() and status = 'pending';

  return true;
end;
$$;

-- ---------------------------------------------------------------- 교회 설정

-- 고정 페이지·교회 정보·테마. 교회 하나만 쓰므로 단일 행으로 둔다.
create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict do nothing;

alter table public.settings enable row level security;

create policy "승인자는 설정 읽기"  on public.settings for select using (public.is_approved());
create policy "승인자는 설정 수정"  on public.settings for update using (public.is_approved())
  with check (public.is_approved());

-- ---------------------------------------------------------------- 주보

create table if not exists public.bulletins (
  id            uuid primary key default gen_random_uuid(),
  service_date  date not null,
  -- 광고·주요일정·설교 블록
  blocks        jsonb not null default '[]'::jsonb,
  -- 작성 시점의 고정 페이지·교회정보·테마. 나중에 설정이 바뀌어도 과거 주보는 그대로 보인다.
  snapshot      jsonb not null default '{}'::jsonb,
  distribution  jsonb not null default '{}'::jsonb,
  export_scale  int  not null default 3,
  export_format text not null default 'jpg',
  -- 내보낸 이미지의 storage 경로
  image_paths   text[] not null default '{}',
  -- 이 토큰이 있는 주소는 로그인 없이 볼 수 있다 (새가족부 QR용)
  share_token   text unique default encode(gen_random_bytes(16), 'hex'),
  created_by    uuid references public.users(id),
  updated_at    timestamptz not null default now()
);

create index if not exists bulletins_service_date_idx on public.bulletins (service_date desc);

alter table public.bulletins enable row level security;

create policy "승인자는 주보 읽기" on public.bulletins
  for select using (public.is_approved());

create policy "승인자는 주보 작성" on public.bulletins
  for insert with check (public.is_approved());

create policy "승인자는 주보 수정" on public.bulletins
  for update using (public.is_approved()) with check (public.is_approved());

create policy "승인자는 주보 삭제" on public.bulletins
  for delete using (public.is_approved());

-- 공유 링크는 토큰을 아는 사람만 열 수 있다.
-- 서버에서 security definer 함수로 조회해 RLS를 우회한다.
create or replace function public.get_shared_bulletin(p_token text)
returns setof public.bulletins
language sql stable security definer set search_path = public
as $$
  select * from public.bulletins where share_token = p_token limit 1;
$$;

-- 수정 시각 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bulletins_touch on public.bulletins;
create trigger bulletins_touch before update on public.bulletins
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- 이미지 저장소

-- 배경·표지·로고·내보낸 주보 이미지
insert into storage.buckets (id, name, public)
values ('bulletin-images', 'bulletin-images', false)
on conflict (id) do nothing;

create policy "승인자는 이미지 읽기" on storage.objects
  for select using (bucket_id = 'bulletin-images' and public.is_approved());

create policy "승인자는 이미지 올리기" on storage.objects
  for insert with check (bucket_id = 'bulletin-images' and public.is_approved());

create policy "승인자는 이미지 지우기" on storage.objects
  for delete using (bucket_id = 'bulletin-images' and public.is_approved());
