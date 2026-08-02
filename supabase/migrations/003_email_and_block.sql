-- 메일 인증 확인과 계정 차단.
--
-- 001_init.sql, 002_share.sql 을 실행한 뒤에 이어서 실행한다.
--
-- 하는 일 셋
--   1. 관리자가 '메일 인증까지 마친 사람'을 눈으로 확인할 수 있게 한다
--   2. 승인했던 사람을 다시 막는 '차단' 상태를 만든다
--   3. 관리자가 실수로 자기 자신을 차단해 아무도 못 들어가는 일을 막는다

-- ---------------------------------------------------------------- 1. 메일 인증

-- 인증 여부는 auth.users 에만 있고 그 표는 화면에서 읽을 수 없다.
-- 그래서 인증 시각을 public.users 로 복사해 두고 관리자 화면에서 읽는다.
alter table public.users
  add column if not exists email_confirmed_at timestamptz;

-- 이미 가입해 있던 사람들 값을 채운다
update public.users u
   set email_confirmed_at = a.email_confirmed_at
  from auth.users a
 where a.id = u.id
   and u.email_confirmed_at is distinct from a.email_confirmed_at;

-- 메일 링크를 누르는 순간 auth.users 가 갱신된다. 그때 이쪽도 따라 바꾼다.
create or replace function public.sync_email_confirmed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.users
     set email_confirmed_at = new.email_confirmed_at
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_email_confirmed();

-- 가입 시점에도 값을 넣어둔다 (메일 인증이 꺼져 있으면 바로 인증된 상태로 들어온다)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
begin
  select count(*) = 0 into first_user from public.users;

  insert into public.users (id, email, name, role, status, approved_at, email_confirmed_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    case when first_user then 'admin'  else 'editor'  end,
    case when first_user then 'approved' else 'pending' end,
    case when first_user then now() end,
    new.email_confirmed_at
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------- 2. 차단

-- pending  가입 신청, 아직 승인 전
-- approved 이용 중
-- rejected 신청을 받지 않음
-- blocked  쓰던 사람을 관리자가 막음 (로그인해도 아무것도 못 한다)
alter table public.users
  drop constraint if exists users_status_check;

alter table public.users
  add constraint users_status_check
  check (status in ('pending', 'approved', 'rejected', 'blocked'));

-- is_approved() 는 status = 'approved' 만 통과시키므로,
-- 차단된 사람은 주보·설정·이미지를 읽지도 쓰지도 못한다. 따로 손댈 것이 없다.

-- ---------------------------------------------------------------- 3. 자기 차단 방지

-- 관리자라도 자기 행의 역할·상태는 바꿀 수 없게 한다.
-- 마지막 관리자가 스스로를 차단하면 되살릴 사람이 없어진다.
-- (이름 수정은 아래 "자기 이름 수정" 정책이 그대로 맡는다)
drop policy if exists "관리자는 전체 수정" on public.users;

create policy "관리자는 남의 정보 수정" on public.users
  for update using (public.is_admin() and id <> auth.uid())
  with check (public.is_admin() and id <> auth.uid());
