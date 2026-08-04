-- 교회 QR은 주일에만 열린다.
--
-- 008 까지 실행한 뒤에 이어서 실행한다.
--
-- 입구에 붙인 QR은 지나가는 누구나 찍을 수 있고, 한 번 찍은 사람은 그 주소를 그대로
-- 카톡에 붙여넣을 수 있다. 주소를 어렵게 만드는 것으로는 막히지 않는다 —
-- 포스터가 그 주소를 알려주기 때문이다. 그래서 주소가 아니라 '기간'을 좁힌다.
-- 퍼져나간 링크라도 주중에는 아무것도 보여주지 않는다.
--
-- 화면에서만 막으면 anon 키(브라우저에 공개되어 있다)로 이 함수를 직접 불러 그대로
-- 받아갈 수 있으므로, 007이 그랬듯 밖으로 내주는 함수 자체가 판단한다.
--
-- 시간대는 반드시 서울이다. 서버는 UTC로 도는데 그대로 요일을 세면
-- 한국시간 일요일 0시~9시가 UTC로는 토요일이라, 정작 주일 아침 예배 시간에 닫혀 있다.

-- 주일이 아닌 날 관리자가 따로 열어둔 끝 시각. 지나면 저절로 닫힌다.
alter table public.published add column if not exists open_until timestamptz;

comment on column public.published.open_until is
  '주일이 아닌 날 관리자가 열어둔 끝 시각(그날 자정). null이면 주일에만 열린다.';

-- ---------------------------------------------------------------- 지금 열려 있는가

-- 교인에게 열려 있는지만 답한다. '만드는 사람은 언제나 본다'는 예외는 여기 넣지 않는다 —
-- 이 함수는 화면이 "왜 안 보이는지"를 골라 안내하는 데에도 쓰이기 때문이다.
create or replace function public.qr_is_open()
returns boolean
language sql stable security definer set search_path = public
as $$
  select
       -- 한국시간으로 오늘이 일요일인가 (0 = 일요일)
       extract(dow from (now() at time zone 'Asia/Seoul')) = 0
       -- 또는 관리자가 오늘 하루 열어두었는가
    or exists (
         select 1
           from public.published
          where id = 1
            and open_until is not null
            and now() < open_until
       );
$$;

grant execute on function public.qr_is_open() to anon, authenticated;

-- ---------------------------------------------------------------- 밖으로 내주는 자리

create or replace function public.get_current_bulletin()
returns setof public.bulletins
language sql stable security definer set search_path = public
as $$
  select b.*
    from public.bulletins b
    join public.published p on p.bulletin_id = b.id
   where p.id = 1
     and p.published_at is not null
     -- 만드는 사람은 요일과 상관없이 볼 수 있다. 토요일에 올려두고 QR을 찍어
     -- 제대로 올라갔는지 확인할 수 없으면 올리기 자체를 믿을 수 없기 때문이다.
     -- 주일 제한은 교인에게만 걸린다.
     and (public.is_approved() or public.qr_is_open())
   limit 1;
$$;

-- ---------------------------------------------------------------- 주일이 아닌 날 열고 닫기

-- 수요예배·성탄절처럼 주일이 아닌 날에도 보여줘야 할 때가 있다.
-- 열어둔 것을 잊어도 그날이 지나면 저절로 닫히게 해, '주일에만 열린다'는 취지가
-- 조용히 무너지지 않게 한다.
create or replace function public.open_today()
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  -- 한국시간으로 오늘이 끝나는 순간
  until timestamptz :=
    ((now() at time zone 'Asia/Seoul')::date + 1)::timestamp at time zone 'Asia/Seoul';
begin
  if not public.is_admin() then
    raise exception '관리자만 주일이 아닌 날에 QR을 열 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  update public.published set open_until = until where id = 1;
  return until;
end;
$$;

create or replace function public.close_today()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 QR을 닫을 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  -- 주보를 내리는 것이 아니라, 오늘 따로 열어둔 것만 거둔다.
  -- 주보를 아주 내리는 것은 unpublish_bulletin()이 맡는다.
  update public.published set open_until = null where id = 1;
end;
$$;

grant execute on function public.open_today()  to authenticated;
grant execute on function public.close_today() to authenticated;

-- ---------------------------------------------------------------- 내릴 때 함께 거둔다

-- 내리기는 '닫는' 일이다. 따로 열어둔 것이 남아 있으면, 같은 날 다시 올렸을 때
-- 주일이 아닌데도 곧바로 열린다. 함께 거둔다.
create or replace function public.unpublish_bulletin()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_approved() then
    raise exception '승인된 사람만 주보를 내릴 수 있습니다' using errcode = 'insufficient_privilege';
  end if;

  update public.published
     set bulletin_id = null, published_at = null, published_by = auth.uid(), open_until = null
   where id = 1;
end;
$$;
