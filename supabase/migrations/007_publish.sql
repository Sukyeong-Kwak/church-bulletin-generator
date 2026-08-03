-- 교회 QR 하나에 이번 주 주보를 올린다.
--
-- 006 까지 실행한 뒤에 이어서 실행한다.
--
-- 입구에 붙인 QR은 한 장이고 주소도 하나(/now)다. 매주 '적용'을 누르면 그 주소가
-- 가리키는 주보만 바뀐다. 저장은 아직 공개가 아니다 — 적용해야 남에게 보인다.
--
-- 화면에서만 막으면 주소를 아는 사람이 그대로 볼 수 있으므로,
-- 밖으로 내주는 함수(get_current_bulletin·get_shared_bulletin) 자체가
-- 적용된 주보만 돌려주게 한다.

-- 지금 올라가 있는 주보. 하나뿐이라 한 줄짜리 표로 둔다.
create table if not exists public.published (
  id           int primary key default 1 check (id = 1),
  bulletin_id  uuid references public.bulletins(id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.users(id)
);

comment on table public.published is 'QR 주소(/now)가 지금 보여주는 주보. 한 줄만 있다.';

insert into public.published (id) values (1) on conflict do nothing;

-- 이미 만들어 둔 주보가 있으면 가장 최근 것을 올려 둔다.
-- 아무것도 안 올라가 있으면 QR을 찍는 사람에게 빈 안내만 보이기 때문이다.
update public.published
   set bulletin_id  = (select id from public.bulletins order by service_date desc limit 1),
       published_at = now()
 where id = 1
   and bulletin_id is null
   and exists (select 1 from public.bulletins);

alter table public.published enable row level security;

-- 만드는 사람들은 지금 무엇이 올라가 있는지 볼 수 있어야 한다.
-- 바꾸는 것은 아래 함수로만 한다(직접 수정은 열지 않는다).
create policy "승인자는 게시 상태 읽기" on public.published
  for select using (public.is_approved());

-- ---------------------------------------------------------------- 밖으로 내주는 자리

-- QR 주소(/now)가 부른다. 로그인하지 않은 사람도 부를 수 있다.
create or replace function public.get_current_bulletin()
returns setof public.bulletins
language sql stable security definer set search_path = public
as $$
  select b.*
    from public.bulletins b
    join public.published p on p.bulletin_id = b.id
   where p.id = 1 and p.published_at is not null
   limit 1;
$$;

grant execute on function public.get_current_bulletin() to anon, authenticated;

-- 주보마다 따로 있던 링크는 없앤다.
-- QR 주소가 /now 하나로 모였으니 쓰이지 않는데, 남겨두면 토큰을 아는 사람에게
-- 열리는 문이 하나 더 있는 셈이 된다.
-- (share_token 칸은 그대로 둔다. 지우는 것은 되돌릴 수 없고, 두어도 새어 나가지 않는다)
drop function if exists public.get_shared_bulletin(text);

-- ---------------------------------------------------------------- 올리기·내리기

create or replace function public.publish_bulletin(p_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  stamp timestamptz := now();
begin
  if not public.is_approved() then
    raise exception '승인된 사람만 주보를 올릴 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.bulletins where id = p_id) then
    raise exception '올리려는 주보를 찾을 수 없습니다. 먼저 저장해주세요' using errcode = 'no_data_found';
  end if;

  update public.published
     set bulletin_id = p_id, published_at = stamp, published_by = auth.uid()
   where id = 1;

  return stamp;
end;
$$;

create or replace function public.unpublish_bulletin()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_approved() then
    raise exception '승인된 사람만 주보를 내릴 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 주보 자체는 지우지 않는다. QR 주소만 다시 닫는다.
  update public.published
     set bulletin_id = null, published_at = null, published_by = auth.uid()
   where id = 1;
end;
$$;

grant execute on function public.publish_bulletin(uuid) to authenticated;
grant execute on function public.unpublish_bulletin()   to authenticated;
