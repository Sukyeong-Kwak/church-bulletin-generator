-- 로그인한 사람에게 표를 열어준다.
--
-- 013 까지 실행한 뒤에 이어서 실행한다.
--
-- ---------------------------------------------------------------- 왜 필요한가
--
-- 문이 둘이다.
--   GRANT  이 표에 손댈 수 있는가          (Postgres의 기본 권한)
--   RLS    그중 어느 행을 보여줄 것인가     (여기서 승인·역할을 가린다)
--
-- 001~013 은 RLS만 세우고 GRANT는 한 번도 주지 않았다. 예전 Supabase 프로젝트는
-- public 스키마의 새 표를 anon·authenticated 에게 자동으로 열어주어서 그래도 됐지만,
-- 지금 프로젝트에는 그 기본값이 없다. 그래서 바깥 문이 잠긴 채로 남아 있었다.
--
-- 증상은 엉뚱한 데서 나온다. 로그인은 되는데 users 를 읽지 못해(42501) 승인 상태를
-- 알 수 없고, 화면은 그를 로그인하지 않은 사람으로 보아 /login 으로 보낸다.
-- proxy 는 세션이 있으니 다시 안으로 되돌린다 — 무한히 튕긴다.
--
-- security definer 함수(get_current_bulletin, redeem_invite_code …)는 만든 사람의
-- 권한으로 돌아 이 문을 통째로 지나친다. QR 화면만 멀쩡했던 까닭이다.
--
-- ---------------------------------------------------------------- 무엇을 여는가
--
-- 로그인한 사람(authenticated)에게만, 그 표의 RLS 정책이 이미 허락한 만큼만 연다.
-- 실제 통제는 그대로 RLS가 한다 — 여기서 select 를 열어도 남의 행은 보이지 않는다.
--
-- anon(로그인하지 않은 사람)에게는 아무 표도 열지 않는다. 로그인 없이 보는 /now 는
-- security definer 함수로만 읽으므로 표 권한이 필요 없다.

grant usage on schema public to authenticated;

-- 자기 정보 읽기 + 이름 수정. (행을 만드는 것은 가입 트리거가 definer로 한다)
grant select, update on public.users to authenticated;

-- 승인된 사람이 주보를 만들고 고치고, 삭제는 관리자만 (008)
grant select, insert, update, delete on public.bulletins to authenticated;

-- 고정 페이지·교회 정보·테마. 행은 하나뿐이라 새로 만들 일이 없다.
grant select, update on public.settings to authenticated;

-- 초대코드는 관리자 전용 정책 하나로 묶여 있다
grant select, insert, update, delete on public.invite_codes to authenticated;

-- 게시 상태·승인 이력은 화면에서 읽기만 한다.
-- 쓰는 것은 publish_bulletin()·decide_user() 가 definer로 대신한다.
grant select on public.published      to authenticated;
grant select on public.user_decisions to authenticated;

-- ---------------------------------------------------------------- 앞으로 만들 표
--
-- 다음에 표를 하나 더 만들면 또 같은 일로 하루를 버리게 된다.
-- 앞으로 postgres 가 public 에 만드는 표는 로그인한 사람에게 기본으로 열어둔다.
-- (RLS는 표마다 따로 켜야 하므로, 이것만으로 열리는 것은 없다)
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- ---------------------------------------------------------------- 확인
--
-- 아래를 실행하면 지금 열려 있는 것이 한눈에 보인다.
--
--   select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated')
--    group by table_name, grantee
--    order by table_name, grantee;
