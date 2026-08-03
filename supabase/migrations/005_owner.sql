-- 최고 관리자.
--
-- 004 까지 실행한 뒤에 이어서 실행한다.
--
-- 관리자는 여러 명이지만, 관리자를 임명하고 내리는 것은 한 사람만 할 수 있다.
-- 그 한 사람이 최고 관리자다 — 가장 먼저 가입한 계정, 즉 이 서비스를 세운 사람이다.
--
--   최고 관리자   역할 임명·회수 + 승인·차단 + 초대코드
--   관리자        승인·차단 + 초대코드            (역할은 못 바꾼다)
--   편집자        주보 작성

alter table public.users
  add column if not exists is_owner boolean not null default false;

comment on column public.users.is_owner is
  '최고 관리자. 화면에서는 바꿀 수 없고 DB에서 직접만 옮긴다.';

-- 가장 먼저 만들어진 계정을 최고 관리자로 잡는다.
-- 이미 누군가 최고 관리자로 표시돼 있으면 손대지 않는다 (다시 실행해도 안전하다).
update public.users
   set is_owner    = true,
       role        = 'admin',
       status      = 'approved',
       approved_at = coalesce(approved_at, now())
 where id = (select id from public.users order by created_at limit 1)
   and not exists (select 1 from public.users where is_owner);

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and is_owner
  );
$$;

grant execute on function public.is_owner() to authenticated;

-- 새 계정은 절대 최고 관리자가 되지 않는다.
-- (첫 가입자만 예외 — 아무도 없는 DB에 처음 들어오는 사람이 곧 세운 사람이다)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
  v_name     text;
  v_code     text;
begin
  select count(*) = 0 into first_user from public.users;

  v_name := trim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  v_code := trim(coalesce(new.raw_user_meta_data ->> 'invite_code', ''));

  if v_name = '' then
    raise exception '이름을 적어야 가입할 수 있습니다' using errcode = 'check_violation';
  end if;

  if not first_user and not public.check_invite_code(v_code) then
    raise exception '초대코드가 유효하지 않습니다' using errcode = 'check_violation';
  end if;

  insert into public.users (id, email, name, role, status, approved_at, email_confirmed_at, is_owner)
  values (
    new.id,
    new.email,
    v_name,
    case when first_user then 'admin'    else 'editor'  end,
    case when first_user then 'approved' else 'pending' end,
    case when first_user then now() end,
    new.email_confirmed_at,
    first_user
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------- 누가 무엇을 바꿀 수 있나
--
-- RLS 정책은 '이 행을 고쳐도 되는가'까지만 본다. '어느 칸을 고쳤는가'는 여기서 본다.
create or replace function public.guard_user_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- 로그인한 사람이 화면으로 고칠 때만 따진다.
  -- SQL 편집기나 서버 열쇠로 고치는 것은 막지 않는다 — 잘못됐을 때 되살릴 길은 있어야 한다.
  if auth.uid() is null then
    return new;
  end if;

  -- 최고 관리자 표시는 화면에서 옮길 수 없다. 스스로에게 붙이는 것도 마찬가지다.
  if new.is_owner is distinct from old.is_owner then
    raise exception '최고 관리자는 화면에서 바꿀 수 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 최고 관리자 계정은 본인 외에 아무도 건드리지 못한다.
  -- 관리자끼리 서로 내리거나 막는 일이 생기지 않게 한다.
  if old.is_owner and auth.uid() <> old.id then
    raise exception '최고 관리자 계정은 다른 사람이 고칠 수 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 누구든 자기 자신은 막지도, 자기 역할을 올리지도 못한다.
  -- 최고 관리자도 마찬가지다 — 스스로를 잠그면 되살릴 사람이 없다.
  -- (이름은 자유롭게 고친다)
  if auth.uid() = old.id
     and (new.status is distinct from old.status or new.role is distinct from old.role) then
    raise exception '자기 자신의 역할과 상태는 바꿀 수 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 관리자를 임명하고 내리는 것은 최고 관리자만 한다.
  if new.role is distinct from old.role and not public.is_owner() then
    raise exception '역할은 최고 관리자만 바꿀 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists users_guard on public.users;
create trigger users_guard before update on public.users
  for each row execute function public.guard_user_change();
