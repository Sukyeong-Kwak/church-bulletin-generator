-- 초대코드를 계정 만들 때가 아니라 메일 인증을 마친 뒤에 받는다.
--
-- 009 까지 실행한 뒤에 이어서 실행한다.
--
-- ---------------------------------------------------------------- 왜 옮기는가
--
-- Supabase는 '계정을 만들면서' 인증번호를 보낸다. 주소만 먼저 확인하는 길이 없다.
-- 그래서 계정 만들기를 초대코드로 막아두면, 코드가 없는 사람은
-- 자기 메일 주소가 제 것이라는 것조차 보일 수 없다. 코드를 받으러 간 사이에
-- 적어둔 것이 다 날아가고, 돌아와 처음부터 다시 적어야 한다.
--
-- 그래서 순서를 이렇게 바꾼다.
--
--   이름·비밀번호  →  메일 인증  →  초대코드  →  가입 신청
--
-- ---------------------------------------------------------------- 문이 열리는 것은 아니다
--
-- 코드 없이 만들어진 계정은 pending 으로 남는다.
-- is_approved() 를 통과하지 못하므로 주보도 설정도 이미지도 읽지 못하고 쓰지 못한다.
-- 할 수 있는 것은 자기 비밀번호를 바꾸는 것뿐이다.
--
-- 코드는 redeem_invite_code() 가 인증 뒤에 받아 그 자리에서 approved 로 올린다 (004).
-- 코드가 없는 사람은 관리자 승인을 기다린다 — 원래 있던 길이고, 관리자 화면의
-- '가입 신청' 목록이 그 사람들을 받는 자리다.
--
-- 바뀐 것은 '아무나 계정을 만들 수 있느냐'이지 '아무나 들어올 수 있느냐'가 아니다.
-- 대신 승인되지 않은 계정 행이 쌓일 수 있다 — 관리자가 거절하면 그 자리에서 정리된다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  first_user boolean;
  v_name     text;
begin
  select count(*) = 0 into first_user from public.users;

  v_name := trim(coalesce(new.raw_user_meta_data ->> 'name', ''));

  -- 이름은 여전히 여기서 막는다. 승인 화면에 이름 없는 줄이 서면 누구인지 알 수 없다.
  if v_name = '' then
    raise exception '이름을 적어야 가입할 수 있습니다' using errcode = 'check_violation';
  end if;

  -- 초대코드 검사는 여기서 하지 않는다 (위 설명 참고).
  -- 첫 사람만 예외로 곧바로 관리자·승인 상태가 된다 — 아무도 없는 DB에 처음 들어온 사람이
  -- 이 서비스를 세운 사람이고, 그를 승인해 줄 관리자가 아직 없기 때문이다.
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

comment on function public.handle_new_user() is
  '계정이 만들어질 때 public.users 행을 함께 만든다. 초대코드는 여기서 보지 않고 redeem_invite_code()가 인증 뒤에 받는다.';
