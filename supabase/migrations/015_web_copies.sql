-- 화면용 축소본도 QR로 들어온 사람에게 열어준다.
--
-- 014 까지 실행한 뒤에 이어서 실행한다.
--
-- ---------------------------------------------------------------- 왜 한 벌 더 두나
--
-- 내보내는 이미지는 인쇄와 밴드 게시를 위해 3배(2673×3780)로 만든다. 그런데 QR을 찍고
-- 들어온 사람 화면은 400px 남짓이다. 여섯 장짜리 주보라면 폰이 20MB 남짓을 받고 나서야
-- 마지막 장이 뜬다 — 예배가 시작될 때까지 다 뜨지 않는 일이 생긴다.
--
-- 그래서 원본은 그대로 두고, 화면에 걸기만 할 축소본(가로 1400px JPG)을 한 벌 더 둔다.
-- 보는 사람은 축소본을, '주보 저장하기'를 누른 사람은 원본을 받는다.
--
-- ---------------------------------------------------------------- 어디에 두나
--
-- 어느 원본의 축소본인지를 표에 칸으로 적지 않는다. 칸을 만들면 그 칸이 비어 있는 옛 주보
-- 때문에 어차피 '있으면 쓰고 없으면 원본'을 해야 하는데, 규칙으로 정해두면 그 판단이
-- 파일이 있느냐 없느냐 한 가지로 끝난다. 규칙은 이렇다.
--
--     export/1234.jpg  →  web/export/1234.jpg
--     bg/5678.png      →  web/bg/5678.jpg      (축소본은 언제나 jpg)
--
-- 코드 쪽 짝은 src/lib/webImage.ts 의 webKeyFor 다. 둘은 같은 규칙이어야 한다.
--
-- ---------------------------------------------------------------- 열리는 범위는 그대로다
--
-- 012 가 정한 것은 '지금 올라간 그 주보의 파일만'이다. 축소본은 그 파일을 작게 만든 것일 뿐
-- 새로운 내용이 아니므로, 원본이 열리는 바로 그 조건에서 함께 열린다.
-- 주보를 내리면 원본과 축소본이 같이 닫힌다.

-- ---------------------------------------------------------------- 원본 목록
--
-- 012 의 current_bulletin_keys() 를 그대로 옮겨 이름만 바꾼 것이다.
-- 목록을 만드는 일과 거기에 축소본을 얹는 일을 갈라 두어야, 나중에 여는 범위를 손볼 때
-- 고칠 자리가 한 군데로 남는다.
create or replace function public.current_bulletin_keys_originals()
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

comment on function public.current_bulletin_keys_originals() is
  'QR 화면이 지금 그리는 데 필요한 저장소 키들 — 원본만. 무엇이 열리는지는 여기서 정해진다.';

-- ---------------------------------------------------------------- 원본 + 그 축소본
create or replace function public.current_bulletin_keys()
returns setof text
language sql stable security definer set search_path = public
as $$
  select k from public.current_bulletin_keys_originals() as k

  union

  -- 위에서 열린 것들의 축소본. 원본이 열리는 것만 여기 들어온다.
  select 'web/' || regexp_replace(k, '\.[^./]+$', '') || '.jpg'
    from public.current_bulletin_keys_originals() as k;
$$;

comment on function public.current_bulletin_keys() is
  'QR 화면이 지금 그리는 데 필요한 저장소 키들. 원본과 그 화면용 축소본(web/…)을 함께 낸다.';

grant execute on function public.current_bulletin_keys_originals() to anon, authenticated;
grant execute on function public.current_bulletin_keys()           to anon, authenticated;

-- 읽기 정책(012)은 손대지 않는다 — 무엇이 열리는지는 위 목록 하나가 정한다.

-- ---------------------------------------------------------------- 같은 자리에 다시 올리기
--
-- 001 은 올리기(insert)와 지우기(delete)만 열어두었다. 그때는 파일 이름이 매번 새로 발급되어
-- 같은 자리에 두 번 올릴 일이 없었기 때문이다.
--
-- 축소본은 다르다. 이름이 원본에서 규칙으로 정해지므로, 같은 원본에 축소본을 다시 만들면
-- 반드시 같은 자리다. 덮어쓰기(upsert)는 이미 있는 파일에 대해 update 권한을 요구하는데
-- 그 정책이 없어, 지금은 조용히 거절당한다 — 축소본이 안 만들어지고 원본으로 되돌아간다.
-- (attachWebCopy 가 실패를 삼키므로 화면에는 아무 표시도 나지 않는다.)
--
-- 올릴 수 있는 사람이 자기가 올린 자리에 다시 올리는 일이라, 올리기와 같은 조건으로 연다.
drop policy if exists "승인자는 이미지 덮어쓰기" on storage.objects;

create policy "승인자는 이미지 덮어쓰기" on storage.objects
  for update using (bucket_id = 'bulletin-images' and public.is_approved())
  with check (bucket_id = 'bulletin-images' and public.is_approved());
