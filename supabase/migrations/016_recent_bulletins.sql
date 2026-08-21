-- 지난 주보를 QR 화면에서 넘겨볼 수 있게 한다.
--
-- 015 까지 실행한 뒤에 이어서 실행한다.
--
-- ---------------------------------------------------------------- 왜
--
-- 지금까지 /now 는 '지금 올라가 있는 한 부'만 보여줬다. 그런데 교인이 지난주 광고를
-- 다시 확인할 길이 없다 — 신청 마감이 이번 주인 것을 지난주 주보에서 봤는데, 그 주보가
-- 어디에도 없다. 만드는 사람에게 물어보는 것 말고는 방법이 없었다.
--
-- ---------------------------------------------------------------- 무엇까지 열리는가
--
-- 아무 주보나 열리면 안 된다. 보관함에는 아직 올리지 않은 이번 주 초안도 들어 있다.
-- 그래서 '한 번이라도 QR 에 올렸던 것'만 목록에 담는다 — 올린다는 것은 교인에게 보이기로
-- 정했다는 뜻이고, 그 판단을 되짚어 쓰는 것이다.
--
-- 열고 닫는 조건은 지금과 똑같다. 주일이거나 관리자가 따로 열어둔 날에만 열리고,
-- 'QR 에서 내리기'를 누르면 지난 것까지 함께 닫힌다 — 내리기는 '닫는' 일이기 때문이다.
--
-- 다만 이 변경으로 로그인 없이 볼 수 있는 범위가 한 주에서 몇 주로 넓어진다.
-- 주보에는 그 달 생일자 이름이 들어가므로, 넓히는 폭은 아래 open_bulletin_ids() 한 곳에서
-- 다섯 부로 묶어 둔다. 이번 주를 넣어 다섯이면 지난 한 달이다.

-- ---------------------------------------------------------------- 올렸던 주보를 기억한다

create table if not exists public.publish_log (
  bulletin_id uuid primary key references public.bulletins(id) on delete cascade,
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now()
);

comment on table public.publish_log is
  '한 번이라도 QR(/now)에 올렸던 주보. 지난 주보 목록의 출처다.';

-- 이미 올라가 있는 한 부는 옮겨 적어 둔다. 이 파일을 실행한 그 주부터 목록이 빈 채로
-- 시작하지 않게 하려는 것이다.
insert into public.publish_log (bulletin_id, first_at, last_at)
select p.bulletin_id, p.published_at, p.published_at
  from public.published p
 where p.id = 1 and p.bulletin_id is not null and p.published_at is not null
on conflict (bulletin_id) do nothing;

alter table public.publish_log enable row level security;

-- 만드는 사람은 무엇이 올라갔었는지 볼 수 있다. 쓰는 것은 아래 함수로만 한다.
drop policy if exists "승인자는 게시 이력 읽기" on public.publish_log;
create policy "승인자는 게시 이력 읽기" on public.publish_log
  for select using (public.is_approved());

-- ---------------------------------------------------------------- 올릴 때 함께 적는다

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

  -- 같은 주보를 오타 고쳐 다시 올리는 일이 잦다. 처음 올린 때는 남기고 마지막만 새로 적는다.
  insert into public.publish_log (bulletin_id, first_at, last_at)
       values (p_id, stamp, stamp)
  on conflict (bulletin_id) do update set last_at = excluded.last_at;

  return stamp;
end;
$$;

grant execute on function public.publish_bulletin(uuid) to authenticated;

-- ---------------------------------------------------------------- 열려 있는 주보들
--
-- 여는 범위를 정하는 자리는 여기 하나다. 아래 두 곳이 모두 이것을 본다.
--   get_recent_bulletins()             화면이 그릴 주보
--   current_bulletin_keys_originals()  그 주보를 그리는 데 필요한 저장소 파일
-- 둘이 어긋나면 목록에는 있는데 그림만 빈 주보가 생긴다.
--
-- 지금 올라가 있는 한 부는 이력에 없더라도, 날짜가 뒤로 밀리더라도 반드시 들어간다.
-- 이 함수가 그 한 부를 떨어뜨리면 이번 주 주보의 그림이 통째로 닫힌다.
create or replace function public.open_bulletin_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  -- 지금 올라가 있는 한 부
  select b.id
    from public.bulletins b
    join public.published p on p.bulletin_id = b.id
   where p.id = 1 and p.published_at is not null

  union

  -- 올렸던 것 가운데 날짜가 가까운 다섯 부.
  -- 아무것도 올라가 있지 않으면 지난 것도 내주지 않는다 — 내리기는 닫는 일이다.
  select s.id from (
    select b.id
      from public.bulletins b
      join public.publish_log l on l.bulletin_id = b.id
     where exists (
             select 1 from public.published p
              where p.id = 1 and p.published_at is not null
           )
     order by b.service_date desc
     limit 5
  ) s;
$$;

grant execute on function public.open_bulletin_ids() to anon, authenticated;

-- ---------------------------------------------------------------- 화면이 그릴 주보

-- QR 화면이 '지난 주보' 목록을 만들 때 부른다. 로그인하지 않은 사람도 부를 수 있다.
-- 요일 제한은 교인에게만 걸린다 (get_current_bulletin 과 같다).
create or replace function public.get_recent_bulletins()
returns setof public.bulletins
language sql stable security definer set search_path = public
as $$
  select b.*
    from public.bulletins b
   where b.id in (select public.open_bulletin_ids())
     and (public.is_approved() or public.qr_is_open())
   order by b.service_date desc;
$$;

grant execute on function public.get_recent_bulletins() to anon, authenticated;

-- ---------------------------------------------------------------- 그 주보들의 파일도 함께 연다
--
-- 012 는 저장소 읽기를 '지금 올라간 그 주보의 파일만'으로 좁혔고, 015 는 그 목록을 만드는
-- 자리를 current_bulletin_keys_originals() 하나로 갈라 두었다 — "나중에 여는 범위를 손볼 때
-- 고칠 자리가 한 군데로 남는다"고 적어둔 그 자리다. 여기가 그 한 군데다.
--
-- 이것을 빠뜨리면 지난 주보가 목록에는 뜨는데 쪽마다 빈칸으로 남는다. 게다가 만드는 사람은
-- 통 안을 전부 볼 수 있어(is_approved) 확인하는 사람 눈에는 멀쩡해 보인다 — 교인에게만 깨진다.
--
-- 읽기 정책(012)과 축소본을 얹는 자리(015)는 손대지 않는다.
create or replace function public.current_bulletin_keys_originals()
returns setof text
language sql stable security definer set search_path = public
as $$
  select k from (
    select u.k
      from public.bulletins b
     cross join lateral unnest(b.image_paths) as u(k)
     where b.id in (select public.open_bulletin_ids())

    union

    select t.v
      from public.bulletins b
     cross join lateral (values
       (b.snapshot #>> '{theme,backgroundUrl}'),
       (b.snapshot #>> '{theme,coverUrl}'),
       (b.snapshot #>> '{theme,logoUrl}')
     ) as t(v)
     where b.id in (select public.open_bulletin_ids())
  ) s(k)
  where k is not null and k <> '';
$$;

comment on function public.current_bulletin_keys_originals() is
  'QR 화면이 지금 그리는 데 필요한 저장소 키들 — 원본만. 여는 범위는 open_bulletin_ids()가 정한다.';
