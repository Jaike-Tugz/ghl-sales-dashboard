-- RLS / RBAC isolation check. Runs inside a transaction and ROLLS BACK, so it
-- is safe against a real project (SQL Editor, or psql as postgres).
-- Every check raises an exception on failure; success prints "RLS CHECK PASSED".
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-admin@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'rls-manager@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'rls-rep@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'rls-new@test.local');
-- Make the test admin an admin regardless of who signed up first.
update user_profiles set role = 'admin', active = true where id = '00000000-0000-0000-0000-0000000000a1';
update user_profiles set role = 'manager', active = true where id = '00000000-0000-0000-0000-0000000000b1';
update user_profiles set role = 'rep', active = true where id = '00000000-0000-0000-0000-0000000000c1';

insert into ghl_accounts (id, name, location_id) values
  ('10000000-0000-0000-0000-00000000000a', 'RLS A', 'RLSTEST-LOC-A'),
  ('10000000-0000-0000-0000-00000000000b', 'RLS B', 'RLSTEST-LOC-B');
insert into ghl_credentials (account_id, access_token_enc) values ('10000000-0000-0000-0000-00000000000a', 'v1.x.y.z');
insert into user_account_access values ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-00000000000a');
insert into sales_reps (id, account_id, ghl_user_id, name, person_key, user_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-00000000000a', 'u1', 'Rep One', 'r1', '00000000-0000-0000-0000-0000000000c1'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-00000000000a', 'u2', 'Rep Two', 'r2', null),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-00000000000b', 'u3', 'Rep Three', 'r3', null);
-- Same GHL id in two locations must not collide.
insert into opportunities (account_id, ghl_opportunity_id, rep_id) values
  ('10000000-0000-0000-0000-00000000000a', 'SAME-ID', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-00000000000a', 'OPP-A2', '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-00000000000b', 'SAME-ID', '20000000-0000-0000-0000-000000000003');

create temp table rls_results (who text, check_name text, got bigint, expected bigint) on commit drop;
grant all on rls_results to authenticated;

-- Admin
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into rls_results select 'admin', 'opportunities', count(*), 3 from opportunities where ghl_opportunity_id in ('SAME-ID','OPP-A2');
-- Manager of A only
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into rls_results select 'manager', 'opportunities', count(*), 2 from opportunities where ghl_opportunity_id in ('SAME-ID','OPP-A2');
insert into rls_results select 'manager', 'accounts', count(*), 1 from ghl_accounts where location_id like 'RLSTEST-%';
-- Rep linked to Rep One
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into rls_results select 'rep', 'opportunities', count(*), 1 from opportunities where ghl_opportunity_id in ('SAME-ID','OPP-A2');
insert into rls_results select 'rep', 'webhook_events', count(*), 0 from webhook_events;
-- Inactive new sign-up sees nothing
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
insert into rls_results select 'inactive', 'opportunities', count(*), 0 from opportunities where ghl_opportunity_id in ('SAME-ID','OPP-A2');
insert into rls_results select 'inactive', 'accounts', count(*), 0 from ghl_accounts where location_id like 'RLSTEST-%';
reset role;

do $$
declare r record; bad int := 0;
begin
  for r in select * from rls_results loop
    if r.got <> r.expected then
      raise warning 'FAIL % / %: got %, expected %', r.who, r.check_name, r.got, r.expected; bad := bad + 1;
    end if;
  end loop;
  if bad > 0 then raise exception '% RLS check(s) failed', bad; end if;
end $$;

-- Credentials are unreadable even to an admin session.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  perform 1 from ghl_credentials;
  raise exception 'FAIL: authenticated user could read ghl_credentials';
exception when insufficient_privilege then null; end $$;

-- Users cannot write GHL-sourced columns, only dashboard-owned ones.
do $$ begin
  update opportunities set monetary_value = 1 where ghl_opportunity_id = 'OPP-A2';
  raise exception 'FAIL: authenticated user could write opportunities.monetary_value';
exception when insufficient_privilege then null; end $$;

-- A manager cannot change roles.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
update user_profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
do $$ begin
  if (select role from user_profiles where id = '00000000-0000-0000-0000-0000000000b1') <> 'manager' then
    raise exception 'FAIL: manager escalated their own role';
  end if;
end $$;

-- The last active admin cannot be removed.
do $$ begin
  update user_profiles set active = false where role = 'admin';
  raise exception 'FAIL: deactivated every admin';
exception when others then
  if sqlerrm not like '%last active admin%' then raise; end if;
end $$;

do $$ begin raise notice 'RLS CHECK PASSED'; end $$;
rollback;
