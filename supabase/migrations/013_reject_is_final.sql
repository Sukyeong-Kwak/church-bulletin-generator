-- 거절을 되돌리는 것은 관리자만 한다.
--
-- 012 까지 실행한 뒤에 이어서 실행한다.
--
-- ---------------------------------------------------------------- 무엇을 되돌리나
--
-- 011 은 거절된 사람도 살아 있는 초대코드가 있으면 다시 들어오게 했다.
-- 코드를 건넸다는 것 자체가 받아들이겠다는 뜻이라고 보았기 때문이다.
--
-- 그런데 코드는 단톡방에 한 번 올리면 열 명까지 쓰는 물건이다.
-- 그것을 거절을 지우는 열쇠로도 쓰면, 거절한 사람이 남이 올린 코드를 주워
-- 조용히 다시 들어오게 된다. 관리자는 그런 일이 있었는지도 모른 채 지나간다.
--
-- 거절을 되돌리는 것은 사람이 다시 판단할 일이다. 관리자 화면의 '거절 취소하고 승인'이
-- 그 자리이고, 누가 언제 되돌렸는지 이력에 남는다.
--
-- 그래서 코드로 열리는 것은 다시 pending 하나뿐이다.

create or replace function public.redeem_invite_code(p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  target    public.invite_codes%rowtype;
  confirmed timestamptz;
  v_status  text;
begin
  select email_confirmed_at into confirmed from auth.users where id = auth.uid();
  if confirmed is null then
    return false;
  end if;

  select status into v_status from public.users where id = auth.uid();

  -- 이미 들어와 있는 사람이 또 눌러도 코드를 축내지 않는다
  if v_status = 'approved' then
    return true;
  end if;

  -- 거절·차단된 계정은 코드로 열리지 않는다. 되돌리는 것은 관리자의 몫이다.
  if v_status is distinct from 'pending' then
    return false;
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

  -- 트리거 둘에게 남기는 표시 (011 참고).
  --   users_guard        '이 자기 승인은 코드를 다 확인하고 온 것이다'
  --   users_decision_log 이력에 남길 까닭
  perform set_config('app.redeeming', 'on', true);
  perform set_config('app.decision_reason', '초대코드 ' || upper(trim(p_code)) || ' 사용', true);

  update public.users
     set status = 'approved', approved_at = now(), approved_by = target.created_by
   where id = auth.uid() and status = 'pending';

  return true;
end;
$$;
