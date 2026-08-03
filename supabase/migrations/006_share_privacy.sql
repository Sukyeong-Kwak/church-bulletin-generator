-- 공유 링크로 다른 달 생일 명단이 새는 것을 막는다.
--
-- 005 까지 실행한 뒤에 이어서 실행한다.
--
-- 주보를 저장할 때 그 시점의 고정 페이지를 통째로 스냅샷에 담아 왔다.
-- 거기에는 그 달뿐 아니라 저장해둔 '모든 달'의 생일 명단이 들어 있었고,
-- 공유 링크(get_shared_bulletin)는 행 전체를 내려주므로, 링크를 받은 사람이
-- 화면에 그려지지 않은 다른 달 명단까지 들여다볼 수 있었다.
--
-- 앞으로 저장되는 주보는 그 달 명단만 담는다(src/lib/backend/map.ts).
-- 이미 저장해둔 주보들은 여기서 잘라낸다.

-- 수정 시각이 오늘로 바뀌면 보관함에서 옛 주보가 방금 손댄 것처럼 보인다. 잠시 꺼둔다.
alter table public.bulletins disable trigger bulletins_touch;

update public.bulletins b
   set snapshot = jsonb_set(
         b.snapshot,
         '{fixed,worship,birthdays}',
         coalesce(
           (select jsonb_object_agg(e.key, e.value)
              from jsonb_each(b.snapshot #> '{fixed,worship,birthdays}') e
             where e.key = to_char(b.service_date, 'YYYY-MM')),
           '{}'::jsonb
         )
       )
 where jsonb_typeof(b.snapshot #> '{fixed,worship,birthdays}') = 'object';

alter table public.bulletins enable trigger bulletins_touch;

-- 설정(public.settings)에는 달별 명단이 그대로 남는다.
-- 그쪽은 승인된 사람만 읽을 수 있고, 다음 달 주보를 만들 때 꺼내 써야 하기 때문이다.
