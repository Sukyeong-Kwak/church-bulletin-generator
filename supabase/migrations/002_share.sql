-- 공유 링크(QR)로 주보를 볼 수 있게 한다.
--
-- 001_init.sql 을 실행한 뒤에 이어서 실행한다.

-- 주보 이미지를 링크로 열 수 있게 한다.
--
-- ⚠ 아래 정책은 012_image_window.sql 이 걷어냈다. 여기 적힌 판단이 틀렸기 때문이다.
--   "목록으로 훑는 것은 막혀 있다"고 적었지만 막혀 있지 않았다 —
--   select 를 열면 저장소 목록 호출도 함께 열려서, 브라우저에 공개된 anon 키만 있으면
--   누구나 아무 때나 통 안의 파일 이름을 전부 받아볼 수 있었다.
--   지난 주보 이미지에는 그 달 생일 명단이 그려져 있다.
--   012 는 '지금 올라간 주보의 파일'만, 그것도 QR이 열린 날에만 내준다.
--   이 파일을 새 DB에 실행할 때는 반드시 012 까지 이어서 실행해야 한다.
--
-- 파일 경로가 무작위 UUID라 주소를 모르면 찾을 수 없다 — 고 여겼던 자리다.
-- 올리기·지우기는 그때나 지금이나 승인된 사람만 할 수 있다.
drop policy if exists "승인자는 이미지 읽기" on storage.objects;

create policy "주보 이미지 읽기" on storage.objects
  for select using (bucket_id = 'bulletin-images');

-- 공유 토큰이 없는 예전 행에 채워 넣는다
update public.bulletins
   set share_token = encode(gen_random_bytes(16), 'hex')
 where share_token is null;

alter table public.bulletins
  alter column share_token set not null;
