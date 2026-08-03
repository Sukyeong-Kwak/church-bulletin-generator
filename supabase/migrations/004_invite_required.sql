-- 가입에 세 가지를 모두 요구한다.
--   1. 이름과 비밀번호
--   2. 유효한 초대코드
--   3. 메일 인증 (인증번호 6자리)
--
-- 001 ~ 003 을 실행한 뒤에 이어서 실행한다.
--
-- 화면에서 막는 것만으로는 부족하다. 가입 요청은 브라우저를 거치지 않고도 보낼 수 있으므로
-- 계정을 만드는 트리거 안에서 직접 막는다.

-- ---------------------------------------------------------------- 초대코드 확인

-- 아직 아무도 가입하지 않은 새 DB인지.
-- 첫 사람에게는 코드를 줄 관리자가 없으므로 그때만 코드 없이 들어올 수 있다.
create or replace function public.invite_required()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.users);
$$;

comment on function public.invite_required() is
  '초대코드가 있어야 가입할 수 있는 상태인가. 가입 화면이 로그인 전에 물어본다.';

-- 코드가 지금 쓸 수 있는 것인지 확인만 한다. 사용 횟수는 늘리지 않는다.
--
-- 코드를 다 만든 다음에 "코드가 틀렸다"고 하면, 쓸 수 없는 계정만 남는다.
-- 그래서 계정을 만들기 전에 이걸로 먼저 물어본다.
create or replace function public.check_invite_code(p_code text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.invite_codes
     where upper(code) = upper(trim(p_code))
       and not revoked
       and expires_at > now()
       and used_count < max_uses
  );
$$;

comment on function public.check_invite_code(text) is
  '코드가 살아 있는지 확인만 한다(소모하지 않음). 코드는 8자리에 24시간짜리라 찍어서 맞히기 어렵다.';

-- 로그인 전에도 물어봐야 하므로 anon 에게도 연다.
grant execute on function public.invite_required()        to anon, authenticated;
grant execute on function public.check_invite_code(text)  to anon, authenticated;

-- ---------------------------------------------------------------- 가입 자체를 막는다

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

  -- 첫 사람만 예외다. 그 뒤로는 살아 있는 초대코드가 있어야 계정이 만들어진다.
  if not first_user and not public.check_invite_code(v_code) then
    raise exception '초대코드가 유효하지 않습니다' using errcode = 'check_violation';
  end if;

  insert into public.users (id, email, name, role, status, approved_at, email_confirmed_at)
  values (
    new.id,
    new.email,
    v_name,
    case when first_user then 'admin'    else 'editor'  end,
    case when first_user then 'approved' else 'pending' end,
    case when first_user then now() end,
    new.email_confirmed_at
  );

  return new;
end;
$$;

-- 여기서 코드를 소모하지는 않는다.
-- 메일 인증을 끝내지 않은 사람이 사용 횟수만 까먹는 것을 막기 위해서다.
-- 실제 소모는 아래 redeem_invite_code 가 인증을 마친 뒤에 한다.

-- ---------------------------------------------------------------- 코드 사용은 인증 뒤에

create or replace function public.redeem_invite_code(p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  target    public.invite_codes%rowtype;
  confirmed timestamptz;
  v_status  text;
begin
  -- 메일 인증을 마치기 전에는 코드를 쓸 수 없다
  select email_confirmed_at into confirmed from auth.users where id = auth.uid();
  if confirmed is null then
    return false;
  end if;

  -- 이미 승인된 사람이 또 눌러도 코드를 축내지 않는다.
  -- 거절·차단된 사람은 코드로 되살아나지 못한다.
  select status into v_status from public.users where id = auth.uid();
  if v_status is distinct from 'pending' then
    return coalesce(v_status = 'approved', false);
  end if;

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
