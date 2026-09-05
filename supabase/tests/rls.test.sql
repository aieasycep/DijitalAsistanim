-- pgTAP · Row Level Security & server-side guards
-- Runs after seed.sql. User 1 = demo user "Yunus", user 2 = another user; nothing may leak across.
begin;
select plan(37);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.as_admin() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- 1. isolation on core tables
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select is((select count(*) from public.email_threads), 10::bigint, 'user1 sees only own email threads');
select is((select count(*) from public.insights), 12::bigint, 'user1 sees only own insights');
select is((select count(*) from public.approval_actions), 2::bigint, 'user1 sees only own approvals');
select is((select count(*) from public.memory_chunks), 5::bigint, 'user1 sees only own memory chunks');
select is((select count(*) from public.contacts), 4::bigint, 'user1 sees only own contacts');
select is((select count(*) from public.profiles), 1::bigint, 'user1 sees only own profile');
select is((select count(*) from public.connected_accounts), 2::bigint, 'user1 sees only own accounts');

select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select is((select count(*) from public.email_threads), 1::bigint, 'user2 sees only own email thread');
select is((select count(*) from public.insights), 1::bigint, 'user2 sees only own insight');
select is((select count(*) from public.approval_actions), 1::bigint, 'user2 sees only own approval');
select is((select count(*) from public.memory_chunks where user_id = '00000000-0000-4000-8000-000000000001'), 0::bigint, 'user2 cannot read user1 memory');
select is((select count(*) from public.email_messages where user_id = '00000000-0000-4000-8000-000000000001'), 0::bigint, 'user2 cannot read user1 messages');

-- ---------------------------------------------------------------------------
-- 2. secrets never readable by clients
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select throws_ok('select * from public.oauth_credentials', '42501', null, 'oauth_credentials are not readable by authenticated users');
select throws_ok('select * from public.oauth_states', '42501', null, 'oauth_states are not readable by authenticated users');
select throws_ok('select * from public.ai_usage', '42501', null, 'ai_usage is not readable by authenticated users');

-- ---------------------------------------------------------------------------
-- 3. server-produced tables are read-only for clients
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.email_threads (user_id, account_id, external_thread_id, subject, last_message_at, fingerprint)
    values ('00000000-0000-4400-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 'x', 'x', now(), 'fp')$$,
  '42501', null, 'clients cannot insert email threads');
select throws_ok(
  $$insert into public.insights (user_id, kind, badge, title, importance, source, entity_type, entity_id, for_date, dedupe_key)
    values ('00000000-0000-4000-8000-000000000001', 'priority', 'urgent', 'x', 'high', '{}'::jsonb, 'email_thread', gen_random_uuid(), current_date, 'k')$$,
  '42501', null, 'clients cannot insert insights');

-- cross-user writes are silently no-ops
update public.insights set status = 'completed' where id = '00000000-0000-4000-8000-00000000310f';
select pg_temp.as_admin();
select is((select status from public.insights where id = '00000000-0000-4000-8000-00000000310f'), 'active'::public.insight_status_t, 'user1 update on user2 insight has no effect');

-- ---------------------------------------------------------------------------
-- 4. client-limited updates: insight status ok, title immutable
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
update public.insights set status = 'completed', title = 'HACKED' where id = '00000000-0000-4000-8000-000000003105';
select is((select status from public.insights where id = '00000000-0000-4000-8000-000000003105'), 'completed'::public.insight_status_t, 'user can complete own insight');
select is((select title from public.insights where id = '00000000-0000-4000-8000-000000003105'), 'Trendyol siparişin bugün geliyor.', 'insight title cannot be changed by client');

-- resolve_insight RPC records feedback
select lives_ok($$select public.resolve_insight('00000000-0000-4000-8000-000000003108', 'dismissed', 'not_important')$$, 'resolve_insight works for own insight');
select is((select count(*) from public.ai_feedback where entity_id = '00000000-0000-4000-8000-000000003108' and kind = 'not_important'), 1::bigint, 'feedback row created');
select throws_ok($$select public.resolve_insight('00000000-0000-4000-8000-00000000310f', 'dismissed', null)$$, 'P0002', null, 'resolve_insight refuses other users insight');

-- profile plan is immutable for clients
update public.profiles set plan = 'free', display_name = 'Yunus E.' where id = '00000000-0000-4000-8000-000000000001';
select is((select plan from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 'pro'::public.plan_t, 'client cannot change plan');
select is((select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000001'), 'Yunus E.', 'client can change display name');

-- ---------------------------------------------------------------------------
-- 5. approval state machine
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update public.approval_actions set status = 'executed' where id = '00000000-0000-4000-8000-000000003301'$$,
  '42501', null, 'client cannot jump pending → executed');
update public.approval_actions set status = 'approved', payload = payload || '{"subject":"Re: Revize teklif (v2)"}'::jsonb where id = '00000000-0000-4000-8000-000000003301';
select is((select status from public.approval_actions where id = '00000000-0000-4000-8000-000000003301'), 'approved'::public.approval_status_t, 'client can approve');
select is((select edited_by_user from public.approval_actions where id = '00000000-0000-4000-8000-000000003301'), true, 'payload edit is flagged');
select throws_ok(
  $$update public.approval_actions set status = 'rejected' where id = '00000000-0000-4000-8000-000000003301'$$,
  '42501', null, 'approved action is no longer editable by client');

select pg_temp.as_admin();
update public.approval_actions set status = 'executing', attempt_count = 1 where id = '00000000-0000-4000-8000-000000003301';
update public.approval_actions set status = 'executed', execution_result = '{"messageId":"m-sent-1"}'::jsonb where id = '00000000-0000-4000-8000-000000003301';
select is((select status from public.approval_actions where id = '00000000-0000-4000-8000-000000003301'), 'executed'::public.approval_status_t, 'server executes approved action');
select throws_ok(
  $$update public.approval_actions set status = 'pending' where id = '00000000-0000-4000-8000-000000003301'$$,
  'P0001', null, 'executed action cannot go back to pending');

-- ---------------------------------------------------------------------------
-- 6. RPCs are user-scoped
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.search_memory('teklif', 10)) >= 2, 'FTS search finds own memory (teklif)');
select is((select count(*) from public.search_memory('teklif', 10) where person_name = 'Ayşe Demir'), 0::bigint, 'search never returns other users chunks');
select is((select (public.my_entitlement() ->> 'isPro')::boolean), true, 'demo user is Pro via demo subscription');
select is(public.increment_usage('assistant_queries', 1), 1, 'usage counter increments');

-- ---------------------------------------------------------------------------
-- 7. storage path scoping
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('captures', '00000000-0000-4000-8000-000000000002/foo.png', '00000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'cannot upload into another users folder');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('captures', '00000000-0000-4000-8000-000000000001/foo.png', '00000000-0000-4000-8000-000000000001')$$,
  'can upload into own folder');

select * from finish();
rollback;
