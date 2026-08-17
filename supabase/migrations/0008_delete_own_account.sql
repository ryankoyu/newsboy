-- =========================================================
-- Newsboy — 회원 탈퇴 (본인 계정 삭제)
-- Source: docs/legal/questions-for-counsel.md B-2
-- =========================================================
--
-- 왜 필요한가
--   이메일 로그인은 이미 동작하는데(web AccountSection.tsx), 계정을 지우는
--   경로가 코드 어디에도 없었다. lib/sync/merge.ts 는 머리말에 "삭제는 이
--   모듈이 표현할 수 없는 개념"이라고 적어두기까지 했다. 로그아웃은 로컬
--   데이터를 그대로 둔다. 즉 한 번 가입하면 나가는 문이 없었다.
--
-- 왜 함수인가 — 서비스롤 키를 배포본에 두지 않기 위해서다
--   auth.users 행을 지우는 것은 보통 service_role 권한이 필요하고, 그 키는
--   RLS 를 통째로 우회한다. 배포된 사이트가 그 키를 들고 있으면 검수 없이
--   발행할 수 있게 되는데(a1 §2 [7]), 그것은 이 구조가 막으려는 바로 그
--   일이다. 그래서 키를 옮기는 대신, 딱 한 가지 일만 하는 함수를 둔다.
--
--   security definer 로 소유자 권한으로 실행되지만, 지우는 대상은 인자가
--   아니라 auth.uid() — 즉 호출한 본인뿐이다. 남의 id 를 넣을 자리가 없다.
--
-- 무엇이 지워지는가
--   auth.users 한 행. 나머지는 따라온다: profiles · reading_progress ·
--   saved_words · bookmarks (0001) 와 saved_sentences (0002) 가 모두
--   auth.users(id) 에 on delete cascade 로 걸려 있다. 지우다 만 계정이
--   남지 않는 이유는 이 함수가 부지런해서가 아니라 스키마가 그렇게 생겨서다.
--
-- 무엇이 남는가 (정직하게)
--   Supabase 가 인증 쪽에 남기는 로그(로그인 시각, IP 등)는 이 함수의
--   관할이 아니다. 무엇이 얼마나 남는지는 코드로 알 수 없고 대시보드에서
--   확인해야 한다 — questions-for-counsel.md D-3.

create or replace function delete_own_account()
returns void
language plpgsql
security definer
-- search_path 를 고정한다. security definer 함수는 호출자가 만든 스키마를
-- 앞에 끼워 넣어 이름을 가로챌 수 있고, 이 함수는 소유자 권한으로 돈다.
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  -- 로그인하지 않은 호출은 지울 대상이 없다. 조용히 넘어가면 "지워졌다"는
  -- 응답을 받게 되므로 명시적으로 거절한다.
  if caller is null then
    raise exception 'not authenticated';
  end if;

  delete from auth.users where id = caller;
end;
$$;

-- anon 은 지울 계정이 없다. 로그인한 사용자에게만 준다.
revoke all on function delete_own_account() from public, anon;
grant execute on function delete_own_account() to authenticated;
