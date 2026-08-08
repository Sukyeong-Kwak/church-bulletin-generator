-- 승인·거절·차단의 이력.
--
-- 010 까지 실행한 뒤에 이어서 실행한다.
--
-- ---------------------------------------------------------------- 왜 남기는가
--
-- 승인과 거절은 사람이 내리는 판단이다. users.status 에는 '지금 무엇인가'만 남고
-- '누가 왜 그렇게 정했는가'는 남지 않는다. 거절된 사람이 다시 신청했을 때,
-- 관리자가 여럿일 때, 몇 달 뒤에 물어볼 때 — 그 자리에서 답할 수 있어야 한다.
--
-- 이력은 고칠 수 없다. 쓰기 정책을 아예 만들지 않아 화면에서는 넣지도 지우지도 못하고,
-- 아래 트리거만이 기록을 남긴다. 남은 기록을 나중에 손보면 그것은 이미 이력이 아니다.

create table if not exists public.user_decisions (
  id          uuid primary key default gen_random_uuid(),

  -- 사람은 지워질 수 있지만 판단의 기록은 남아야 한다.
  -- 그래서 이어두기만 하고(set null), 누구였는지는 그때의 이름과 메일로 따로 새긴다.
  user_id     uuid references public.users(id) on delete set null,
  user_name   text not null default '',
  user_email  text not null default '',

  -- 상태는 늘 적는다(바뀌지 않은 줄에도 '그때 무엇이었는지'가 남아야 읽힌다).
  from_status text,
  to_status   text not null,

  -- 역할은 바뀐 줄에만 채워진다. 둘 다 null 이면 이 줄은 상태만 바뀐 것이다.
  -- 편집자를 관리자로 올리는 것은 승인보다 큰 일이라 같은 자리에 남긴다.
  from_role   text,
  to_role     text,

  -- 거절과 차단에만 받는다. 승인은 왜 받아들였는지 적을 것이 없다.
  reason      text,

  actor_id    uuid references public.users(id) on delete set null,
  actor_name  text not null default '',
  actor_email text not null default '',

  created_at  timestamptz not null default now()
);

-- 위 create 는 표가 이미 있으면 통째로 지나간다 — 나중에 더한 칸이 빠지지 않게 따로 챙긴다
alter table public.user_decisions add column if not exists from_role text;
alter table public.user_decisions add column if not exists to_role   text;

comment on table public.user_decisions is
  '가입 승인·거절·차단과 역할 변경의 이력. 트리거만 쓰고 아무도 고치지 못한다.';
comment on column public.user_decisions.actor_name is
  '판단한 사람의 그때 이름. 계정이 지워져도 누가 했는지는 남아야 한다.';

create index if not exists user_decisions_user_idx    on public.user_decisions (user_id, created_at desc);
create index if not exists user_decisions_created_idx on public.user_decisions (created_at desc);

-- ---------------------------------------------------------------- 누가 보나
--
-- 관리자는 모두 본다. 승인을 맡은 사람들이 서로의 판단을 볼 수 없으면
-- 같은 사람을 한쪽은 거절하고 한쪽은 승인하는 일이 생긴다.
alter table public.user_decisions enable row level security;

drop policy if exists "관리자는 이력 읽기" on public.user_decisions;
create policy "관리자는 이력 읽기" on public.user_decisions
  for select using (public.is_admin());

-- 쓰기 정책은 두지 않는다. 아래 트리거(security definer)만이 기록을 남긴다.

-- ---------------------------------------------------------------- 기록하는 트리거
--
-- 화면이 아니라 표에 붙여둔다. SQL 편집기로 직접 고치든 화면에서 누르든
-- status 가 바뀌면 반드시 한 줄이 남는다. 빠뜨릴 자리를 만들지 않는다.
create or replace function public.log_user_decision()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_reason       text;
  v_actor        public.users%rowtype;
  v_role_changed boolean := new.role is distinct from old.role;
begin
  -- 이름만 고쳤을 때는 남기지 않는다
  if new.status is not distinct from old.status and not v_role_changed then
    return new;
  end if;

  -- 사유는 decide_user() 가 같은 트랜잭션 안에 잠깐 놓아둔다.
  -- SQL 편집기로 직접 고치면 비어 있는데, 그때도 기록은 남아야 하므로 막지 않는다.
  v_reason := nullif(trim(coalesce(current_setting('app.decision_reason', true), '')), '');

  select * into v_actor from public.users where id = auth.uid();

  insert into public.user_decisions (
    user_id, user_name, user_email,
    from_status, to_status,
    from_role, to_role,
    reason,
    actor_id, actor_name, actor_email
  ) values (
    new.id, new.name, new.email,
    old.status, new.status,
    -- 역할이 그대로면 비워둔다. 매번 채우면 어느 줄이 역할을 바꾼 줄인지 알 수 없다.
    case when v_role_changed then old.role end,
    case when v_role_changed then new.role end,
    v_reason,
    v_actor.id,
    coalesce(v_actor.name,  ''),
    coalesce(v_actor.email, '')
  );

  return new;
end;
$$;

drop trigger if exists users_decision_log on public.users;
create trigger users_decision_log after update of status, role on public.users
  for each row execute function public.log_user_decision();

-- ---------------------------------------------------------------- 화면이 부르는 자리
--
-- security definer 를 쓰지 않는다. 그래야 RLS 와 users_guard(005) 가 그대로 적용된다 —
-- 관리자가 아니면 UPDATE 자체가 막히고, 자기 자신을 잠그는 것도 여전히 막힌다.
create or replace function public.decide_user(
  p_user   uuid,
  p_status text,
  p_reason text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  -- RLS 만으로도 막히지만 여기서 한 번 더 본다.
  -- 뒷날 users 의 수정 정책이 넓어지면 이 함수가 조용히 구멍이 되기 때문이고,
  -- 막혔을 때 '권한이 없다'와 '그런 사람이 없다'를 갈라 말해주기 위해서다.
  if not public.is_admin() then
    raise exception '관리자만 가입 상태를 바꿀 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  if p_status not in ('pending', 'approved', 'rejected', 'blocked') then
    raise exception '알 수 없는 상태입니다: %', p_status using errcode = 'check_violation';
  end if;

  -- 사람을 막는 판단에는 까닭을 적게 한다.
  -- 승인은 적을 것이 없지만, 거절과 차단은 나중에 반드시 물어보게 된다.
  if p_status in ('rejected', 'blocked') and v_reason is null then
    raise exception '거절과 차단은 사유를 적어야 합니다' using errcode = 'check_violation';
  end if;

  -- 트리거가 읽어갈 자리에 놓아둔다. true = 이 트랜잭션에서만 살아 있다.
  perform set_config('app.decision_reason', coalesce(v_reason, ''), true);

  update public.users
     set status      = p_status,
         approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at = case when p_status = 'approved' then now()      else approved_at end
   where id = p_user;

  if not found then
    raise exception '그 사람을 찾지 못했거나 고칠 권한이 없습니다' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

grant execute on function public.decide_user(uuid, text, text) to authenticated;

comment on function public.decide_user(uuid, text, text) is
  '가입 상태를 바꾸고 그 까닭을 이력에 남긴다. 화면은 users 를 직접 고치지 않고 이것만 부른다.';

-- ---------------------------------------------------------------- 초대코드로 승인된 것도 남긴다
--
-- 004 의 함수를 두 가지 고쳐 다시 쓴다.
--
--   1. 이력에 사유 한 줄을 남긴다 — '왜 갑자기 승인됐는지' 빈칸이 생기지 않게
--   2. 거절된 사람도 유효한 코드가 있으면 다시 들어온다
--
-- 2번의 까닭:
-- 거절은 대개 '지금은 모르는 분'이라는 뜻이지 '영영 안 된다'가 아니다. 나중에 등록할 수도 있고
-- 관리자가 잘못 눌렀을 수도 있다. 그런데 코드는 관리자가 손수 건네는 것이다 —
-- 코드를 받았다는 것 자체가 이미 '이제 받아들이겠다'는 뜻이므로, 그것을 다시 막을 까닭이 없다.
-- 되살아난 사실은 아래 트리거가 이력에 남기므로 조용히 지나가지도 않는다.
--
-- 차단(blocked)은 다르다. 쓰던 사람을 관리자가 막은 것이라 푸는 것도 관리자의 몫으로 둔다.
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

  -- 코드로 열리는 것은 이 둘뿐이다
  if v_status is null or v_status not in ('pending', 'rejected') then
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

  -- 트리거 둘에게 남기는 표시.
  --   users_guard        '이 자기 승인은 코드를 다 확인하고 온 것이다' (없으면 여기서 막힌다)
  --   users_decision_log 이력에 남길 까닭
  -- 둘 다 이 트랜잭션에서만 살아 있고, 밖에서는 세울 길이 없다.
  perform set_config('app.redeeming', 'on', true);

  -- 거절됐던 사람이 되살아난 것은 그냥 승인과 다르다. 이력에서 갈라 읽히게 적는다.
  perform set_config(
    'app.decision_reason',
    '초대코드 ' || upper(trim(p_code)) || ' 사용'
      || case when v_status = 'rejected' then ' (거절된 뒤 코드로 다시 가입)' else '' end,
    true
  );

  update public.users
     set status = 'approved', approved_at = now(), approved_by = target.created_by
   where id = auth.uid() and status in ('pending', 'rejected');

  return true;
end;
$$;

-- ---------------------------------------------------------------- 이력이 거짓말하지 않게
--
-- 이력은 그때의 이름과 메일을 그대로 새긴다. 그런데 users 의 '자기 정보 수정' 정책은
-- 역할과 상태만 잠가두어, 본인이 자기 메일 주소를 마음대로 바꿀 수 있었다.
-- 거절당하기 직전에 메일을 바꿔두면 남는 기록이 엉뚱한 사람을 가리키게 된다.
--
-- 메일 주소는 auth.users 가 가진 것을 따라 적어둔 사본일 뿐, 화면에서 고칠 일이 없다.
-- (이름은 그대로 고칠 수 있다 — 계정 화면이 하는 일이다)
--
-- 여기서 오래된 버그도 하나 함께 고친다.
--
-- 이 트리거는 '자기 자신의 상태는 못 바꾼다'고 막는다. 그런데 초대코드로 가입하는 것이
-- 바로 그 짓이다 — 본인이 자기 status 를 approved 로 올린다.
-- redeem_invite_code 가 security definer 라 RLS 는 지나가지만, 트리거는 그것과 상관없이 돌고
-- auth.uid() 도 그대로 본인을 가리킨다. 그래서 005 이후로 초대코드 승인은 이 자리에서 걸렸다.
--
-- 그 길만 열어준다. redeem_invite_code 가 같은 트랜잭션에 표시를 남기고 들어오는데,
-- 그 함수는 코드가 살아 있는지·메일 인증을 마쳤는지·지금 상태가 무엇인지를 이미 다 보고 왔다.
-- 표시는 화면에서 세울 수 없다 — set_config 를 부를 길이 밖으로 나가 있지 않다.
create or replace function public.guard_user_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_redeeming boolean :=
    coalesce(current_setting('app.redeeming', true), '') = 'on';
begin
  if auth.uid() is null then
    return new;
  end if;

  -- 메일 주소는 화면에서 바꾸지 않는다. 바꿀 수 있으면 이력이 가리키는 사람이 흔들린다.
  if new.email is distinct from old.email then
    raise exception '메일 주소는 화면에서 바꿀 수 없습니다' using errcode = 'insufficient_privilege';
  end if;

  if new.is_owner is distinct from old.is_owner then
    raise exception '최고 관리자는 화면에서 바꿀 수 없습니다' using errcode = 'insufficient_privilege';
  end if;

  if old.is_owner and auth.uid() <> old.id then
    raise exception '최고 관리자 계정은 다른 사람이 고칠 수 없습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 초대코드로 스스로 들어오는 길만 예외다 (위 설명 참고). 역할은 그때도 못 바꾼다.
  if auth.uid() = old.id
     and not v_redeeming
     and (new.status is distinct from old.status or new.role is distinct from old.role) then
    raise exception '자기 자신의 역할과 상태는 바꿀 수 없습니다' using errcode = 'insufficient_privilege';
  end if;

  if new.role is distinct from old.role and not public.is_owner() then
    raise exception '역할은 최고 관리자만 바꿀 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- 안 쓰는 문은 닫는다
--
-- check_invite_code 는 계정을 만들기 전에 코드를 미리 확인하려고 로그인 없이도 열어두었다.
-- 010 부터는 코드를 인증 뒤에 받으므로 로그인하지 않은 사람이 이것을 부를 일이 없다.
-- 열어두면 코드를 하나씩 넣어보며 맞는 것을 찾는 일을 아무나 할 수 있다.
revoke execute on function public.check_invite_code(text) from anon;

-- ---------------------------------------------------------------- 이미 있던 사람들
--
-- 이력은 오늘부터 쌓이지만, 이미 승인된 사람들의 줄이 비어 있으면
-- '기록이 없는 것'인지 '아직 안 만든 것'인지 알 수 없다. 아는 만큼만 채워둔다.
insert into public.user_decisions (
  user_id, user_name, user_email, from_status, to_status, reason,
  actor_id, actor_name, actor_email, created_at
)
select u.id, u.name, u.email, 'pending', 'approved', '이력을 남기기 전에 승인된 계정입니다',
       a.id, coalesce(a.name, ''), coalesce(a.email, ''), u.approved_at
  from public.users u
  left join public.users a on a.id = u.approved_by
 where u.approved_at is not null
   and not exists (select 1 from public.user_decisions d where d.user_id = u.id);
