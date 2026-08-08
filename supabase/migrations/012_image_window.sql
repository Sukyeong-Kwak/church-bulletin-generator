-- 주보 이미지는 '지금 올라간 그 주보의 것'만 열린다.
--
-- 011 까지 실행한 뒤에 이어서 실행한다.
--
-- ---------------------------------------------------------------- 무엇이 열려 있었나
--
-- 002 는 QR로 들어온 사람이 주보를 보려면 이미지를 내려받을 수 있어야 해서
-- 저장소 읽기를 이렇게 열어두었다.
--
--     using (bucket_id = 'bulletin-images')
--
-- 조건이 '이 통에 있는 파일인가'뿐이다. 그래서 브라우저에 공개되어 있는 anon 키만 있으면
-- 누구나, 아무 때나, 통 안의 모든 파일을 내려받을 수 있었다. 목록을 훑는 것도 함께 열려 있었다 —
-- 002 의 주석은 파일 이름이 무작위라 찾을 수 없다고 적었지만, 목록을 부르면 이름이 그대로 나온다.
--
-- 지난 주보 이미지에는 그 달 생일 명단이 그려져 있다. 006 이 스냅샷에서 애써 잘라낸 것이
-- 이미지로는 그대로 남아 있었던 셈이다.
--
-- ---------------------------------------------------------------- 익명과 무제한은 다르다
--
-- 이 화면은 로그인 없이 열려야 한다. 교인이 폰으로 QR을 찍고 들어오는 자리이기 때문이다.
-- 그러나 '로그인 없이 본다'와 '통 안의 모든 것을 본다'는 전혀 다른 이야기다.
--
-- 열려야 하는 것은 딱 하나 — 지금 올라가 있는 그 주보다.
-- 지난 주보를 목록으로 훑는 것은 아무도 부탁한 적이 없다.
--
-- 그래서 파일 하나하나를 두고 '이것이 지금 올라간 주보의 것인가'를 묻는다.
-- 아니면 주일이라도 내주지 않는다.

-- ---------------------------------------------------------------- 지금 열려 있어야 하는 파일들
--
-- /now 가 실제로 부르는 것은 둘뿐이다.
--   1. image_paths        올릴 때 만들어 둔 페이지 이미지 (SharedView → SharedImages)
--   2. theme 의 배경·표지·로고  이미지가 없는 옛 주보를 화면에서 다시 그릴 때 (SharedBulletin)
-- 그 밖의 파일은 QR로 들어온 사람에게 필요하지 않다.
create or replace function public.current_bulletin_keys()
returns setof text
language sql stable security definer set search_path = public
as $$
  select k from (
    select u.k
      from public.bulletins b
      join public.published p on p.bulletin_id = b.id
     cross join lateral unnest(b.image_paths) as u(k)
     where p.id = 1 and p.published_at is not null

    union

    select t.v
      from public.bulletins b
      join public.published p on p.bulletin_id = b.id
     cross join lateral (values
       (b.snapshot #>> '{theme,backgroundUrl}'),
       (b.snapshot #>> '{theme,coverUrl}'),
       (b.snapshot #>> '{theme,logoUrl}')
     ) as t(v)
     where p.id = 1 and p.published_at is not null
  ) s(k)
  where k is not null and k <> '';
$$;

comment on function public.current_bulletin_keys() is
  'QR 화면이 지금 그리는 데 필요한 저장소 키들. 저장소 읽기 정책이 이 목록만 내준다.';

grant execute on function public.current_bulletin_keys() to anon, authenticated;

-- ---------------------------------------------------------------- 읽기 정책
drop policy if exists "주보 이미지 읽기"   on storage.objects;
drop policy if exists "승인자는 이미지 읽기" on storage.objects;

create policy "주보 이미지 읽기" on storage.objects
  for select using (
    bucket_id = 'bulletin-images'
    and (
      -- 만드는 사람은 전부 본다. 배경과 로고를 고르려면 통 안을 볼 수 있어야 한다.
      public.is_approved()

      -- QR로 들어온 사람에게는 지금 올라간 주보의 파일만, 그것도 열려 있는 날에만.
      -- 목록을 부르더라도 이 조건을 통과하는 것만 돌아오므로 지난 주보는 이름조차 나오지 않는다.
      or (public.qr_is_open() and name in (select public.current_bulletin_keys()))
    )
  );

-- 올리기·지우기는 그대로 승인된 사람만 (001에서 만든 정책을 손대지 않는다).

-- ---------------------------------------------------------------- 이제 이렇게 된다
--
--   만드는 사람        언제나 전부
--   교인(anon)         주일에, 지금 올라간 주보의 이미지만
--   그 밖              아무것도
--
-- 주소를 알아도 소용이 없다. 내려간 주보의 이미지는 그 순간부터 닫힌다.
