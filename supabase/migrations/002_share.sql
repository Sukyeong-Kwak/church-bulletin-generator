-- 공유 링크(QR)로 주보를 볼 수 있게 한다.
--
-- 001_init.sql 을 실행한 뒤에 이어서 실행한다.

-- 주보 이미지를 링크로 열 수 있게 한다.
--
-- 파일 경로가 무작위 UUID라 주소를 모르면 찾을 수 없다. 링크를 아는 사람만 보는 방식이다.
-- 어떤 파일이 있는지 목록으로 훑는 것은 여전히 막혀 있고, 올리기·지우기는 승인된 사람만 할 수 있다.
--
-- 더 엄격하게 막고 싶다면 이 정책 대신 서버에서 service_role 키로 파일을 중계하면 된다.
-- 다만 그 경우 비밀 키를 배포 환경에 따로 넣어야 한다.
drop policy if exists "승인자는 이미지 읽기" on storage.objects;

create policy "주보 이미지 읽기" on storage.objects
  for select using (bucket_id = 'bulletin-images');

-- 공유 토큰이 없는 예전 행에 채워 넣는다
update public.bulletins
   set share_token = encode(gen_random_bytes(16), 'hex')
 where share_token is null;

alter table public.bulletins
  alter column share_token set not null;
